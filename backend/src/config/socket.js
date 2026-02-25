import { Server } from "socket.io";
import redis from "./redis.js";

// Simple in-memory tracker for active 1:1 calls
// key: username, value: other username
const activeCalls = new Map();

const endCallSession = (userA, userB) => {
  if (!userA) return;
  const peer = activeCalls.get(userA) || userB;
  if (peer) {
    activeCalls.delete(peer);
  }
  activeCalls.delete(userA);
};

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

    /* ================= REGISTER ================= */
    socket.on("register_user", async (username) => {
      socket.username = username;

      await redis.sAdd("users:all", username);
      await redis.hSet("users:online", username, socket.id);

      io.emit("users_list", await redis.sMembers("users:all"));
      io.emit("users_status", await redis.hGetAll("users:online"));
    });

    /* ================= CHAT ================= */
    socket.on("private_message", async (data) => {
      const { from, to } = data;

      const msg = { ...data, time: Date.now() };
      const chatKey = `chat:${[from, to].sort().join(":")}`;

      await redis.rPush(chatKey, JSON.stringify(msg));

      // increment unread for receiver
      const unreadCount = await redis.hIncrBy(`unread:${to}`, from, 1);

      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", msg);

        // send unread update to receiver
        io.to(receiverSocket).emit("unread_update", {
          from,
          count: unreadCount,
        });
      }

      socket.emit("receive_message", msg);
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

      const receiverSocket = await redis.hGet("users:online", to);
      if (!receiverSocket) return;

      // Guard: prevent multiple simultaneous calls
      if (activeCalls.has(caller) || activeCalls.has(to)) {
        console.warn("⚠️ user-busy: either caller or callee already in a call");
        socket.emit("user-busy");
        return;
      }

      // Mark both users as in-call
      activeCalls.set(caller, to);
      activeCalls.set(to, caller);

      const systemMsg = {
        system: true,
        text: "📞 Call started",
        from: caller,
        to,
        time: Date.now(),
      };

      const chatKey = `chat:${[caller, to].sort().join(":")}`;
      await redis.rPush(chatKey, JSON.stringify(systemMsg));

      socket.emit("receive_message", systemMsg);
      io.to(receiverSocket).emit("receive_message", systemMsg);

      io.to(receiverSocket).emit("incoming-call", {
        from: caller,
        offer,
      });
    });

    /* ================= CALL ANSWER ================= */
    socket.on("answer-call", async ({ to, answer }) => {
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

    /* ================= CALL REJECT ================= */
    socket.on("reject-call", async ({ to }) => {
      const receiverSocket = await redis.hGet("users:online", to);

      const systemMsg = {
        system: true,
        text: "❌ Call rejected",
        from: socket.username,
        to,
        time: Date.now(),
      };

      const chatKey = `chat:${[socket.username, to].sort().join(":")}`;
      await redis.rPush(chatKey, JSON.stringify(systemMsg));

      socket.emit("receive_message", systemMsg);
      socket.emit("call-ended");

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", systemMsg);
        io.to(receiverSocket).emit("call-ended");
      }

      endCallSession(socket.username, to);
    });

    socket.on("clear_unread", async ({ me, other }) => {
      await redis.hSet(`unread:${me}`, other, 0);
    });

    /* ================= CALL END ================= */
    socket.on("end-call", async ({ to }) => {
      const receiverSocket = await redis.hGet("users:online", to);

      const systemMsg = {
        system: true,
        text: "❌ Call ended",
        from: socket.username,
        to,
        time: Date.now(),
      };

      const chatKey = `chat:${[socket.username, to].sort().join(":")}`;
      await redis.rPush(chatKey, JSON.stringify(systemMsg));

      socket.emit("receive_message", systemMsg);

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", systemMsg);
        io.to(receiverSocket).emit("call-ended");
      }

      endCallSession(socket.username, to);
    });

    /* ================= MISSED CALL ================= */
    socket.on("missed-call", async ({ to }) => {
      try {
        const receiverSocket = await redis.hGet("users:online", to);

        const chatKey = `chat:${[socket.username, to].sort().join(":")}`;

        const systemMsg = {
          system: true,
          type: "missed-call",
          text: "📵 Missed call",
          from: socket.username,
          to,
          time: Date.now(),
        };

        await redis.rPush(chatKey, JSON.stringify(systemMsg));
        await redis.hIncrBy(`unread:${to}`, socket.username, 1);

        socket.emit("receive_message", systemMsg);

        if (receiverSocket) {
          io.to(receiverSocket).emit("receive_message", systemMsg);
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

    /* ================= DISCONNECT ================= */
    socket.on("disconnect", async () => {
      if (socket.username) {
        // If user was in an active call, notify the peer
        const peer = activeCalls.get(socket.username);
        if (peer) {
          const peerSocket = await redis.hGet("users:online", peer);
          if (peerSocket) {
            io.to(peerSocket).emit("call-ended");
          }
          endCallSession(socket.username, peer);
        }

        await redis.hDel("users:online", socket.username);
      }
      io.emit("users_status", await redis.hGetAll("users:online"));
      console.log("🔴 Disconnected:", socket.id);
    });
  });
};