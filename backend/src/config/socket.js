import { Server } from "socket.io";
import redis from "./redis.js";
import { saveMessage, chatKey, markSeen, groupChatKey, SEEN_TTL_MS } from "../utils/messageStore.js";
import { isBlocked } from "../controllers/block.controller.js";
import { getGroupMembers } from "../controllers/group.controller.js";
import { setIO } from "../utils/io.js";
import { bumpDmActivity, bumpGroupActivity } from "../utils/activity.js";

// Simple in-memory tracker for active 1:1 calls
// key: username, value: other username
const activeCalls = new Map();
// De-dupe ringing phase so repeated "call-user" from same pair doesn't
// spam multiple incoming-call events while callee is already handling one.
// key format: "<caller>::<callee>"
const pendingCallInvites = new Set();

const inviteKey = (caller, callee) => `${caller}::${callee}`;

// In-memory tracker for group video-call participants.
//   groupCallParticipants: groupId  →  Set<username>
// Used to know who to broadcast to when someone joins/leaves and
// to send the joining client the existing participant list so they
// can initiate WebRTC offers to each one (mesh topology).
const groupCallParticipants = new Map();

const endCallSession = (userA, userB) => {
  if (!userA) return;
  const peer = activeCalls.get(userA) || userB;
  if (peer) {
    activeCalls.delete(peer);
    pendingCallInvites.delete(inviteKey(userA, peer));
    pendingCallInvites.delete(inviteKey(peer, userA));
  }
  activeCalls.delete(userA);
  if (userB) {
    pendingCallInvites.delete(inviteKey(userA, userB));
    pendingCallInvites.delete(inviteKey(userB, userA));
  }
};

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,

      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Send a personalised users list to every ONLINE socket — each
  // user sees the full registry minus their own blocked set.
  // We iterate the users:online Redis hash (username → socketId) which
  // we already maintain on register/disconnect.
  const broadcastUsersList = async () => {
    const all = await redis.sMembers("users:all");
    const onlineMap = await redis.hGetAll("users:online");

    await Promise.all(
      Object.entries(onlineMap).map(async ([username, socketId]) => {
        const blocked = new Set(await redis.sMembers(`blocked:${username}`));
        io.to(socketId).emit(
          "users_list",
          all.filter((u) => !blocked.has(u))
        );
      })
    );
  };

  // Expose the io instance so HTTP controllers can broadcast (e.g.
  // posting system messages to a group when membership changes).
  setIO(io);

  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

    /* ================= REGISTER ================= */
    socket.on("register_user", async (username) => {
      socket.username = username;

      await redis.sAdd("users:all", username);
      await redis.hSet("users:online", username, socket.id);

      await broadcastUsersList();
      io.emit("users_status", await redis.hGetAll("users:online"));
    });

    // Listening clients can ask to refresh their list (e.g. after
    // (un)blocking) without disconnecting. We re-send a personalised
    // list to that one socket.
    socket.on("refresh_users_list", async () => {
      if (!socket.username) return;
      const blocked = new Set(await redis.sMembers(`blocked:${socket.username}`));
      const all = await redis.sMembers("users:all");
      socket.emit(
        "users_list",
        all.filter((u) => !blocked.has(u))
      );
    });

    /* ================= CHAT ================= */
    socket.on("private_message", async (data) => {
      const { from, to } = data;

      // Receiver has blocked sender → silently drop. The sender keeps
      // seeing their own bubble (echo below) so they never realise
      // they were blocked. Receiver gets nothing, no unread bump.
      const blocked = await isBlocked(to, from);

      const stored = await saveMessage(chatKey(from, to), {
        ...data,
        time: Date.now(),
      });

      await bumpDmActivity(from, to);

      socket.emit("receive_message", stored); // sender's own echo

      if (blocked) return;

      const unreadCount = await redis.hIncrBy(`unread:${to}`, from, 1);
      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", stored);
        io.to(receiverSocket).emit("unread_update", {
          from,
          count: unreadCount,
        });
      }
    });

    /* ================= TYPING INDICATOR ================= */
    socket.on("typing", async ({ to }) => {
      if (!socket.username || !to) return;
      const receiverSocket = await redis.hGet("users:online", to);
      if (!receiverSocket) return;
      io.to(receiverSocket).emit("typing", { from: socket.username });
    });

    /* ================= CALL START ================= */
    socket.on("call-user", async ({ to, offer }) => {
      // Guard: username not registered yet — prevents incoming-call with from: undefined
      if (!socket.username) {
        console.warn("⚠️ call-user ignored — socket.username not set yet");
        return;
      }

      const caller = socket.username;
      console.log("📞 CALL USER EVENT:", caller, "->", to);
      const k = inviteKey(caller, to);

      const receiverSocket = await redis.hGet("users:online", to);
      if (!receiverSocket) return;

      // Receiver blocked caller → drop the invite. From the caller's
      // POV the call just rings out and goes to missed-call after 20s.
      if (await isBlocked(to, caller)) {
        console.log(`🚫 call dropped — ${to} has blocked ${caller}`);
        return;
      }

      // Guard: prevent multiple simultaneous calls
      if (activeCalls.has(caller) || activeCalls.has(to)) {
        console.warn("⚠️ user-busy: either caller or callee already in a call");
        socket.emit("user-busy");
        return;
      }

      if (pendingCallInvites.has(k)) {
        console.warn("⚠️ duplicate incoming-call suppressed:", k);
        return;
      }
      pendingCallInvites.add(k);

      // Mark both users as in-call
      activeCalls.set(caller, to);
      activeCalls.set(to, caller);

      const stored = await saveMessage(chatKey(caller, to), {
        system: true,
        text: "📞 Call started",
        from: caller,
        to,
        time: Date.now(),
      });

      socket.emit("receive_message", stored);
      io.to(receiverSocket).emit("receive_message", stored);

      io.to(receiverSocket).emit("incoming-call", {
        from: caller,
        offer,
      });
    });

    /* ================= CALL ANSWER ================= */
    socket.on("answer-call", async ({ to, answer }) => {
      pendingCallInvites.delete(inviteKey(to, socket.username));
      pendingCallInvites.delete(inviteKey(socket.username, to));
      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("call-accepted", { answer });
      }
    });

    /* ================= ICE ================= */
    socket.on("ice-candidate", async ({ to, candidate }) => {
      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("ice-candidate", { candidate });
      }
    });

    /* ================= MID-CALL RENEGOTIATION (e.g. camera turned on late) ================= */
    socket.on("call-renegotiate", async ({ to, offer }) => {
      if (!socket.username || !to || !offer) return;
      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("call-renegotiate", {
          from: socket.username,
          offer,
        });
      }
    });

    socket.on("call-renegotiate-answer", async ({ to, answer }) => {
      if (!socket.username || !to || !answer) return;
      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("call-renegotiate-answer", { answer });
      }
    });

    /* ================= CALL REJECT ================= */
    socket.on("reject-call", async ({ to }) => {
      pendingCallInvites.delete(inviteKey(to, socket.username));
      pendingCallInvites.delete(inviteKey(socket.username, to));
      const receiverSocket = await redis.hGet("users:online", to);

      const stored = await saveMessage(chatKey(socket.username, to), {
        system: true,
        text: "❌ Call rejected",
        from: socket.username,
        to,
        time: Date.now(),
      });

      socket.emit("receive_message", stored);
      socket.emit("call-ended");

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", stored);
        io.to(receiverSocket).emit("call-ended");
      }

      endCallSession(socket.username, to);
    });

    socket.on("clear_unread", async ({ me, other }) => {
      if (!me || !other) return;
      await redis.hSet(`unread:${me}`, other, 0);

      // Snapchat-style: mark all of `other`'s messages to `me` as seen
      // and reset their expiry to (now + SEEN_TTL). Tell `other` so
      // their UI can flip the bubble to "Seen" and start the countdown.
      const seenIds = await markSeen(chatKey(me, other), other);
      if (seenIds.length) {
        const seenAt = Date.now();
        const expiresAt = seenAt + SEEN_TTL_MS;
        const payload = { by: me, ids: seenIds, seenAt, expiresAt };
        const senderSocket = await redis.hGet("users:online", other);
        if (senderSocket) io.to(senderSocket).emit("messages_seen", payload);
        socket.emit("messages_seen", payload);
      }
    });

    /* ================= CALL END ================= */
    socket.on("end-call", async ({ to }) => {
      pendingCallInvites.delete(inviteKey(socket.username, to));
      pendingCallInvites.delete(inviteKey(to, socket.username));
      // Idempotency: if this call session is already torn down
      // (e.g. peer also emitted end-call, or missed-call already ran),
      // skip writing another "❌ Call ended" message. Both sides racing
      // to emit end-call on connection failure would otherwise duplicate.
      const stillActive =
        activeCalls.get(socket.username) === to ||
        activeCalls.get(to) === socket.username;
      if (!stillActive) {
        // Still make sure the peer's UI tears down, then bail.
        const receiverSocket = await redis.hGet("users:online", to);
        if (receiverSocket) io.to(receiverSocket).emit("call-ended");
        return;
      }

      const receiverSocket = await redis.hGet("users:online", to);

      const stored = await saveMessage(chatKey(socket.username, to), {
        system: true,
        text: "❌ Call ended",
        from: socket.username,
        to,
        time: Date.now(),
      });

      socket.emit("receive_message", stored);

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", stored);
        io.to(receiverSocket).emit("call-ended");
      }

      endCallSession(socket.username, to);
    });

    /* ================= MISSED CALL ================= */
    socket.on("missed-call", async ({ to }) => {
      try {
        pendingCallInvites.delete(inviteKey(socket.username, to));
        pendingCallInvites.delete(inviteKey(to, socket.username));
        const receiverSocket = await redis.hGet("users:online", to);

        const stored = await saveMessage(chatKey(socket.username, to), {
          system: true,
          type: "missed-call",
          text: "📵 Missed call",
          from: socket.username,
          to,
          time: Date.now(),
        });
        await redis.hIncrBy(`unread:${to}`, socket.username, 1);

        socket.emit("receive_message", stored);

        if (receiverSocket) {
          io.to(receiverSocket).emit("receive_message", stored);
          // Auto-dismiss the receiver's IncomingCall popup (and any
          // CallOverlay if it somehow mounted). Existing "call-ended"
          // listener in IncomingCall/CallOverlay handles teardown.
          io.to(receiverSocket).emit("call-ended");
        }

        endCallSession(socket.username, to);
      } catch (err) {
        console.error("Missed call error:", err);
      }
    });

    /* ================= CALL-ONLY CHAT (TEMP) ================= */
    socket.on("call_message", async ({ to, message, file, fileName }) => {
      const payload = {
        from: socket.username,
        message,
        file,
        fileName,
        time: Date.now(),
      };

      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("call_message", payload);
      }

      socket.emit("call_message", payload);
    });

    /* ================= GROUP CHAT ================= */
    socket.on("group_message", async (data) => {
      const { groupId } = data || {};
      if (!groupId || !socket.username) return;

      const members = await getGroupMembers(groupId);
      if (!members.includes(socket.username)) return; // not a member, ignore

      const stored = await saveMessage(groupChatKey(groupId), {
        ...data,
        from: socket.username,
        time: Date.now(),
      });

      await bumpGroupActivity(groupId, members);

      // Fan out to every online member (including sender for echo).
      await Promise.all(
        members.map(async (m) => {
          const sid = await redis.hGet("users:online", m);
          if (sid) io.to(sid).emit("group_message", stored);
        })
      );
    });

    // Tell sidebar of every member to re-fetch their group list, e.g.
    // when a new group is created or a member is added.
    socket.on("group_invalidate", async ({ groupId }) => {
      if (!groupId) return;
      const members = await getGroupMembers(groupId);
      await Promise.all(
        members.map(async (m) => {
          const sid = await redis.hGet("users:online", m);
          if (sid) io.to(sid).emit("group_invalidate", { groupId });
        })
      );
    });

    /* ================= GROUP VIDEO CALL (MESH) =================
       Signaling-only: server never sees media. Each client maintains
       N-1 RTCPeerConnections, one per other participant. */
    socket.on("group_call_join", async ({ groupId }) => {
      if (!groupId || !socket.username) return;

      // Authorise: must be a member
      const members = await getGroupMembers(groupId);
      if (!members.includes(socket.username)) return;

      const set = groupCallParticipants.get(groupId) || new Set();
      const wasEmpty = set.size === 0;          // 1st joiner = call initiator
      const existing = [...set].filter((u) => u !== socket.username);
      set.add(socket.username);
      groupCallParticipants.set(groupId, set);

      // If THIS is the very first joiner, ring every other member.
      // Subsequent joiners don't trigger a new ring — they just slot
      // into the existing call.
      if (wasEmpty) {
        await Promise.all(
          members
            .filter((m) => m !== socket.username)
            .map(async (m) => {
              const sid = await redis.hGet("users:online", m);
              if (sid) io.to(sid).emit("group_call_invitation", {
                groupId,
                initiator: socket.username,
              });
            })
        );

        // Auto-cancel the ringing UI after 30s if no one picks up.
        // Capture the Set instance so we only cancel THIS session — if
        // the call has since ended and a new one has been started, the
        // map will hold a different Set reference and we'll bail out.
        const callSession = set;
        setTimeout(async () => {
          if (groupCallParticipants.get(groupId) !== callSession) return;
          if (callSession.size > 1) return; // someone picked up
          await Promise.all(
            members.map(async (m) => {
              const sid = await redis.hGet("users:online", m);
              if (sid) io.to(sid).emit("group_call_invitation_cancelled", { groupId });
            })
          );
        }, 30_000);
      }

      // 1) Tell the joiner about the existing participants so it can
      //    initiate offers to each one.
      socket.emit("group_call_peers", { groupId, peers: existing });

      // 2) Tell everyone already in the call that someone new joined.
      //    They'll wait for an offer from the new joiner.
      await Promise.all(
        existing.map(async (u) => {
          const sid = await redis.hGet("users:online", u);
          if (sid) io.to(sid).emit("group_call_peer_joined", {
            groupId,
            peer: socket.username,
          });
        })
      );

      // 3) Notify all group members (even non-participants) that a
      //    call is live for the badge/ringtone in sidebar.
      await Promise.all(
        members.map(async (m) => {
          const sid = await redis.hGet("users:online", m);
          if (sid) io.to(sid).emit("group_call_state", {
            groupId,
            participants: [...set],
          });
        })
      );
    });

    socket.on("group_call_leave", async ({ groupId }) => {
      if (!groupId || !socket.username) return;
      const set = groupCallParticipants.get(groupId);
      if (!set) return;
      set.delete(socket.username);
      const nowEmpty = set.size === 0;
      if (nowEmpty) groupCallParticipants.delete(groupId);

      const members = await getGroupMembers(groupId);
      await Promise.all(
        members.map(async (m) => {
          const sid = await redis.hGet("users:online", m);
          if (!sid) return;
          io.to(sid).emit("group_call_peer_left", {
            groupId,
            peer: socket.username,
          });
          io.to(sid).emit("group_call_state", {
            groupId,
            participants: [...(groupCallParticipants.get(groupId) || [])],
          });
          // If the room is now empty, dismiss the ringing UI for any
          // member who hadn't picked up yet.
          if (nowEmpty) {
            io.to(sid).emit("group_call_invitation_cancelled", { groupId });
          }
        })
      );
    });

    // Relay SDP/ICE between two specific peers in a group call.
    socket.on("group_call_signal", async ({ groupId, to, payload }) => {
      if (!groupId || !to || !socket.username) return;
      const sid = await redis.hGet("users:online", to);
      if (!sid) return;
      io.to(sid).emit("group_call_signal", {
        groupId,
        from: socket.username,
        payload,
      });
    });

    // Ephemeral in-call chat. Not persisted — vanishes when the call ends.
    // Fanned out only to participants currently in the call.
    socket.on("group_call_message", ({ groupId, message }) => {
      if (!groupId || !message || !socket.username) return;
      const set = groupCallParticipants.get(groupId);
      if (!set || !set.has(socket.username)) return;

      const payload = {
        groupId,
        from: socket.username,
        message: String(message).slice(0, 500),
        time: Date.now(),
      };
      set.forEach(async (u) => {
        const sid = await redis.hGet("users:online", u);
        if (sid) io.to(sid).emit("group_call_message", payload);
      });
    });

    /* ================= DISCONNECT ================= */
    socket.on("disconnect", async () => {
      if (socket.username) {
        // 1:1 call cleanup
        const peer = activeCalls.get(socket.username);
        if (peer) {
          const peerSocket = await redis.hGet("users:online", peer);
          if (peerSocket) {
            io.to(peerSocket).emit("call-ended");
          }
          endCallSession(socket.username, peer);
        }

        // Group call cleanup — remove from every group-call we were in
        for (const [groupId, set] of groupCallParticipants.entries()) {
          if (!set.has(socket.username)) continue;
          set.delete(socket.username);
          if (set.size === 0) groupCallParticipants.delete(groupId);

          const members = await getGroupMembers(groupId);
          await Promise.all(
            members.map(async (m) => {
              const sid = await redis.hGet("users:online", m);
              if (!sid) return;
              io.to(sid).emit("group_call_peer_left", {
                groupId,
                peer: socket.username,
              });
              io.to(sid).emit("group_call_state", {
                groupId,
                participants: [...(groupCallParticipants.get(groupId) || [])],
              });
            })
          );
        }

        await redis.hDel("users:online", socket.username);
      }
      io.emit("users_status", await redis.hGetAll("users:online"));
      console.log("🔴 Disconnected:", socket.id);
    });
  });
};