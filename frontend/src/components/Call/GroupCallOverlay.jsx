import React, { useEffect, useMemo, useRef, useState } from "react";
import socket from "../../services/socket";

/**
 * Mesh-topology group video call (Meet-style for small groups).
 *
 * On mount:
 *   1. Open mic+cam (best-effort: fall back to audio-only if cam denied).
 *   2. Emit `group_call_join` → server responds with `group_call_peers`
 *      listing the existing participants.
 *   3. For each existing participant, WE initiate an offer. Convention:
 *      the new joiner always offers — avoids signaling glare.
 *   4. When `group_call_peer_joined` arrives later, we just wait for
 *      that new joiner's offer.
 *
 * Each peer connection is independent. `peersRef.current` is a Map
 *   peerUsername → { pc, stream, audioOn, videoOn }
 *
 * `tiles` state mirrors that map for rendering. We bump a counter to
 * force re-renders when the underlying refs change.
 */

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function GroupCallOverlay({ groupId, me, onClose }) {
  const [tiles, setTiles] = useState([]);            // [{ user, stream, audioOn, videoOn }]
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState("");

  // In-call chat (ephemeral — disappears when the call ends)
  const [showChat, setShowChat] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [unreadDot, setUnreadDot] = useState(false);
  const showChatRef = useRef(false);
  useEffect(() => { showChatRef.current = showChat; if (showChat) setUnreadDot(false); }, [showChat]);
  const chatListRef = useRef(null);
  useEffect(() => {
    if (chatListRef.current) chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [chatMsgs.length, showChat]);

  const peersRef = useRef(new Map());                // user → { pc, stream }
  const localStreamRef = useRef(null);
  const cleanedUpRef = useRef(false);
  const localVideoRef = useRef(null);

  /* Helper to commit current peers map into state (triggers render). */
  const refreshTiles = () => {
    const next = [];
    for (const [user, entry] of peersRef.current.entries()) {
      next.push({ user, stream: entry.stream });
    }
    setTiles(next);
  };

  /* Create or fetch a peer connection for a given remote user. */
  const ensurePeer = (user) => {
    let entry = peersRef.current.get(user);
    if (entry) return entry;

    const pc = new RTCPeerConnection(ICE);

    // Push our local tracks into the new pc
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        pc.addTrack(t, localStreamRef.current);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("group_call_signal", {
          groupId,
          to: user,
          payload: { candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      const cur = peersRef.current.get(user);
      if (!cur) return;
      // Merge tracks into a single stream per peer
      if (!cur.stream) cur.stream = new MediaStream();
      e.streams[0].getTracks().forEach((t) => {
        if (!cur.stream.getTracks().includes(t)) cur.stream.addTrack(t);
      });
      refreshTiles();
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        // Drop this peer; if they're still around they'll reconnect.
        const e2 = peersRef.current.get(user);
        if (e2 && pc.connectionState === "failed") {
          try { pc.close(); } catch {}
          peersRef.current.delete(user);
          refreshTiles();
        }
      }
    };

    entry = { pc, stream: null };
    peersRef.current.set(user, entry);
    return entry;
  };

  /* I am the new joiner — initiate offers to every existing peer. */
  const offerTo = async (user) => {
    const { pc } = ensurePeer(user);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("group_call_signal", {
        groupId,
        to: user,
        payload: { sdp: pc.localDescription },
      });
    } catch (err) {
      console.error("offerTo failed:", user, err);
    }
  };

  /* Handle an incoming signal (offer, answer, or candidate). */
  const handleSignal = async ({ from, payload }) => {
    const { pc } = ensurePeer(from);
    try {
      if (payload.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        if (payload.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("group_call_signal", {
            groupId,
            to: from,
            payload: { sdp: pc.localDescription },
          });
        }
      } else if (payload.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          // Candidates can arrive before remote description; ignore.
        }
      }
    } catch (err) {
      console.error("handleSignal failed:", err);
    }
  };

  /* ============== INIT ============== */
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      // 1. Get media (cam preferred, fall back to audio)
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setCamOn(false);
        } catch (err) {
          setError("Mic/camera unavailable. " + (err?.message || ""));
          return;
        }
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // 2. Wire socket handlers BEFORE join so we don't miss anything
      socket.on("group_call_peers", onPeers);
      socket.on("group_call_peer_joined", onPeerJoined);
      socket.on("group_call_peer_left", onPeerLeft);
      socket.on("group_call_signal", handleSignal);
      socket.on("group_call_message", onChatMessage);

      // 3. Join
      socket.emit("group_call_join", { groupId });
    };

    const onChatMessage = (data) => {
      if (data?.groupId !== groupId) return;
      setChatMsgs((prev) => [...prev, data]);
      if (!showChatRef.current && data.from !== me) setUnreadDot(true);
    };

    const onPeers = ({ groupId: gid, peers }) => {
      if (gid !== groupId) return;
      peers.forEach((user) => {
        ensurePeer(user);
        offerTo(user);
      });
      refreshTiles();
    };
    const onPeerJoined = ({ groupId: gid, peer }) => {
      if (gid !== groupId) return;
      ensurePeer(peer);
      refreshTiles();
    };
    const onPeerLeft = ({ groupId: gid, peer }) => {
      if (gid !== groupId) return;
      const e = peersRef.current.get(peer);
      if (e) {
        try { e.pc.close(); } catch {}
        peersRef.current.delete(peer);
        refreshTiles();
      }
    };

    start();

    return () => {
      cancelled = true;
      socket.off("group_call_peers", onPeers);
      socket.off("group_call_peer_joined", onPeerJoined);
      socket.off("group_call_peer_left", onPeerLeft);
      socket.off("group_call_signal", handleSignal);
      socket.off("group_call_message", onChatMessage);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  /* Keep the local <video> hooked to its stream — even if React
     re-mounts the element after a refreshTiles. */
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const cleanup = () => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    socket.emit("group_call_leave", { groupId });

    peersRef.current.forEach((e) => { try { e.pc.close(); } catch {} });
    peersRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  };

  const leave = () => {
    cleanup();
    onClose?.();
  };

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const next = !micOn;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };
  const toggleCam = () => {
    if (!localStreamRef.current) return;
    const next = !camOn;
    localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    socket.emit("group_call_message", { groupId, message: text });
    setDraft("");
  };

  const formatTime = (ms) => {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Grid columns based on participant count (including me)
  const totalTiles = tiles.length + 1;
  const cols = useMemo(() => {
    if (totalTiles <= 1) return 1;
    if (totalTiles <= 2) return 2;
    if (totalTiles <= 4) return 2;
    if (totalTiles <= 9) return 3;
    return 4;
  }, [totalTiles]);

  return (
    <div style={styles.overlay}>
      <div style={styles.topBar}>
        <span style={styles.topTitle}>🎥 Group call</span>
        <span style={styles.topCount}>{totalTiles} participant{totalTiles === 1 ? "" : "s"}</span>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.body}>
        <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {/* Self tile */}
          <Tile name={`${me} (You)`} stream={localStream} muted videoOn={camOn} self isMicOn={micOn} videoRef={localVideoRef} />
          {/* Remote tiles */}
          {tiles.map((t) => (
            <Tile key={t.user} name={t.user} stream={t.stream} muted={false} videoOn={true} />
          ))}
        </div>

        {/* In-call chat side panel */}
        {showChat && (
          <aside className="gcall-chat" style={styles.chatPanel}>
            <div style={styles.chatHeader}>
              <h3 style={styles.chatTitle}>In-Call Chat</h3>
              <button onClick={() => setShowChat(false)} style={styles.chatClose}>✕</button>
            </div>
            <div ref={chatListRef} style={styles.chatList}>
              {chatMsgs.length === 0 ? (
                <div style={styles.chatEmpty}>
                  <span style={{ fontSize: 36, opacity: 0.3 }}>💬</span>
                  <p style={{ margin: 0, fontSize: 13, color: "#999" }}>No messages yet</p>
                </div>
              ) : (
                chatMsgs.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.bubbleWrap,
                      alignSelf: m.from === me ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        ...styles.bubble,
                        background: m.from === me
                          ? "linear-gradient(135deg,#ff6b35,#ff8c42)"
                          : "#fff",
                        color: m.from === me ? "#fff" : "#222",
                      }}
                    >
                      {m.from !== me && <div style={styles.bubbleFrom}>{m.from}</div>}
                      <div style={{ fontSize: 14, lineHeight: 1.4 }}>{m.message}</div>
                      <div
                        style={{
                          ...styles.bubbleTime,
                          color: m.from === me ? "rgba(255,255,255,0.75)" : "#999",
                        }}
                      >
                        {formatTime(m.time)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={styles.chatInputBar}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Type a message…"
                style={styles.chatInput}
              />
              <button onClick={sendChat} style={styles.sendBtn} disabled={!draft.trim()}>
                ➤
              </button>
            </div>
          </aside>
        )}
      </div>

      <div style={styles.controls}>
        <button
          onClick={toggleMic}
          style={{ ...styles.ctrlBtn, background: micOn ? "#fff" : "#ef4444", color: micOn ? "#333" : "#fff" }}
          title={micOn ? "Mute" : "Unmute"}
        >
          {micOn ? "🎤" : "🔇"}
        </button>
        <button
          onClick={toggleCam}
          style={{ ...styles.ctrlBtn, background: camOn ? "#fff" : "#ef4444", color: camOn ? "#333" : "#fff" }}
          title={camOn ? "Turn camera off" : "Turn camera on"}
        >
          {camOn ? "📷" : "🚫"}
        </button>
        <button
          onClick={() => setShowChat((s) => !s)}
          style={{ ...styles.ctrlBtn, position: "relative" }}
          title="Toggle in-call chat"
        >
          💬
          {unreadDot && <span style={styles.unreadDot} />}
        </button>
        <button onClick={leave} style={{ ...styles.ctrlBtn, ...styles.leaveBtn }} title="Leave call">
          📵
        </button>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .gcall-chat {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100dvh !important;
            z-index: 10001;
          }
        }
      `}</style>
    </div>
  );
}

/* ============== TILE COMPONENT ============== */
function Tile({ name, stream, muted, videoOn, self, isMicOn, videoRef }) {
  const innerRef = useRef(null);
  const ref = videoRef || innerRef;

  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.srcObject !== stream) {
      ref.current.srcObject = stream || null;
    }
  }, [stream, ref]);

  return (
    <div style={styles.tile}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{
          ...styles.video,
          transform: self ? "scaleX(-1)" : "none", // mirror own preview
          display: stream && videoOn ? "block" : "none",
        }}
      />
      {(!stream || !videoOn) && (
        <div style={styles.avatarFallback}>
          <div style={styles.avatarCircle}>{name.charAt(0).toUpperCase()}</div>
        </div>
      )}
      <div style={styles.nameTag}>
        {name}
        {self && isMicOn === false && <span style={styles.micOff}> 🔇</span>}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "#000", zIndex: 10000, display: "flex", flexDirection: "column" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: "rgba(0,0,0,0.6)", color: "#fff" },
  topTitle: { fontWeight: 800, fontSize: 14 },
  topCount: { fontSize: 12, color: "#aaa" },
  error: { background: "#ef4444", color: "#fff", padding: "10px 14px", fontSize: 13, textAlign: "center" },
  body: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" },
  grid: { flex: 1, display: "grid", gap: 8, padding: 8, overflow: "hidden", minHeight: 0 },
  tile: { position: "relative", background: "#111", borderRadius: 12, overflow: "hidden", minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center" },
  video: { width: "100%", height: "100%", objectFit: "cover" },
  avatarFallback: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" },
  avatarCircle: { width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#ff6b35,#ff8c42)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 32, boxShadow: "0 8px 22px rgba(0,0,0,0.4)" },
  nameTag: { position: "absolute", bottom: 8, left: 8, padding: "4px 10px", borderRadius: 14, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, fontWeight: 600 },
  micOff: { marginLeft: 4 },
  controls: { display: "flex", justifyContent: "center", gap: 14, padding: 16, background: "rgba(0,0,0,0.6)" },
  ctrlBtn: { width: 54, height: 54, borderRadius: "50%", border: "none", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" },
  leaveBtn: { background: "#ef4444", color: "#fff" },
  unreadDot: { position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: "50%", background: "#ef4444", border: "2px solid #fff" },

  /* CHAT SIDE PANEL */
  chatPanel: { width: 340, background: "linear-gradient(180deg,#1a1a1a 0%, #111 100%)", display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,0.08)" },
  chatHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "linear-gradient(135deg,#ff6b35 0%,#ff8c42 100%)" },
  chatTitle: { margin: 0, color: "#fff", fontSize: 15, fontWeight: 700 },
  chatClose: { width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.22)", border: "none", color: "#fff", fontSize: 13, cursor: "pointer" },
  chatList: { flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 },
  chatEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 },
  bubbleWrap: { display: "flex", maxWidth: "100%" },
  bubble: { maxWidth: "85%", padding: "10px 12px", borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" },
  bubbleFrom: { fontSize: 11, fontWeight: 700, color: "#ff6b35", marginBottom: 3 },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: "right" },
  chatInputBar: { display: "flex", gap: 8, padding: 12, background: "rgba(255,255,255,0.04)", borderTop: "1px solid rgba(255,255,255,0.06)" },
  chatInput: { flex: 1, padding: "10px 14px", background: "#222", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" },
  sendBtn: { width: 42, height: 42, borderRadius: "50%", border: "none", background: "linear-gradient(135deg,#ff6b35,#ff8c42)", color: "#fff", fontSize: 16, cursor: "pointer", flexShrink: 0 },
};
