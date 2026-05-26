import React, { useEffect, useRef, useState } from "react";
import socket from "../../services/socket";
import API from "../../services/api";
import ProfileViewer from "../Profile/ProfileViewer";
import GroupInfoModal from "../Group/GroupInfoModal";

// ✅ FIX: Guard against undefined env variable
const RAW_API_URL = import.meta.env.VITE_API_BASE_URL || "";
const BASE_URL = RAW_API_URL.replace("/api", "");

// Debug: log so you can verify in console
console.log("BASE_URL =>", BASE_URL);

// ✅ Smart URL helper — works whether m.file is full URL or relative path
const getFileUrl = (filePath) => {
  if (!filePath) return "";
  // Already a full URL (http or https) — use as-is, no BASE_URL needed
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }
  // Relative path like /uploads/xyz.jpg — prepend BASE_URL
  return `${BASE_URL}${filePath}`;
};

const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

// Snapchat-style "X left" indicator. Returns null once expired so the
// caller can hide the bubble entirely.
const formatRemaining = (expiresAt, now) => {
  if (!expiresAt) return null;
  const ms = expiresAt - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h left`;
  if (m >= 1) return `${m}m left`;
  return `${Math.max(1, Math.floor(ms / 1000))}s left`;
};

const formatDate = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
};

export default function ChatBox({ user, group, onCall, onBack, onGroupUpdated, onLeft }) {
  const me = localStorage.getItem("username");
  // `group` mode: many members, sender names per bubble, no read-receipt UI.
  // `user`  mode: classic DM — read receipt + per-peer profile.
  const isGroup = !!group;
  const targetId = isGroup ? group.id : user;

  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState("");
  const [recording, setRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageModal, setImageModal] = useState(null);
  const [peerProfile, setPeerProfile] = useState(null);
  const [showPeerProfile, setShowPeerProfile] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState({}); // for group sender avatars

  /* Fetch the chat peer's profile (DM mode) OR all member profiles (group). */
  useEffect(() => {
    let cancelled = false;
    if (!isGroup && user) {
      API.get(`/users/profile/${user}`)
        .then((res) => { if (!cancelled) setPeerProfile(res.data); })
        .catch(() => {});
    } else if (isGroup && group?.members?.length) {
      API.get(`/users/profile/bulk`, { params: { usernames: group.members.join(",") } })
        .then((res) => { if (!cancelled) setMemberProfiles(res.data || {}); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [isGroup, user, group?.id, group?.members?.length]);
  // Drives the per-message countdown re-render. 30s granularity is
  // plenty for an "X hours left" / "X minutes left" indicator.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // Snapchat-style: locally hide messages whose server-stamped expiry
  // has already passed (the server has already pruned them in Redis;
  // this just makes the UI consistent without a refetch).
  const visibleMessages = messages.filter(
    (m) => !m.expiresAt || m.expiresAt > now
  );

  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  /* ================= LOAD CHAT ================= */
  useEffect(() => {
    if (!targetId) return;
    if (isGroup) {
      API.get(`/groups/${group.id}/history`)
        .then((res) => setMessages(res.data))
        .catch(console.error);
    } else {
      API.get(`/chat/history/${me}/${user}`)
        .then((res) => setMessages(res.data))
        .catch(console.error);
      socket.emit("clear_unread", { me, other: user });
    }
  }, [targetId, isGroup, me, user, group?.id]);

  /* ================= SOCKET LISTENER ================= */
  useEffect(() => {
    // DM receive
    const dmHandler = (data) => {
      if (isGroup) return; // ignore in group mode
      if (data.system) { setMessages((prev) => [...prev, data]); return; }
      if ((data.from === me && data.to === user) || (data.from === user && data.to === me)) {
        setMessages((prev) => [...prev, data]);
      }
    };
    // Group receive
    const groupHandler = (data) => {
      if (!isGroup) return;
      if (data.groupId !== group?.id) return;
      setMessages((prev) => [...prev, data]);
    };
    // Read-receipt for DMs
    const seenHandler = ({ ids, seenAt, expiresAt }) => {
      if (!ids?.length) return;
      const set = new Set(ids);
      setMessages((prev) =>
        prev.map((m) =>
          set.has(m.id)
            ? { ...m, seenAt, expiresAt: expiresAt || seenAt + 24 * 60 * 60 * 1000 }
            : m
        )
      );
    };
    socket.on("receive_message", dmHandler);
    socket.on("group_message", groupHandler);
    socket.on("messages_seen", seenHandler);
    return () => {
      socket.off("receive_message", dmHandler);
      socket.off("group_message", groupHandler);
      socket.off("messages_seen", seenHandler);
    };
  }, [isGroup, user, me, group?.id]);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ================= SEND TEXT ================= */
  const sendText = () => {
    if (!msg.trim()) return;
    if (isGroup) {
      socket.emit("group_message", { groupId: group.id, message: msg });
    } else {
      socket.emit("private_message", { from: me, to: user, message: msg });
    }
    setMsg("");
  };

  /* ================= FILE ================= */
  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file);
    if (file.type.startsWith("image")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const sendFile = async () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append("file", selectedFile);
    const res = await API.post("/media/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const data = res.data;
    const payload = {
      file: data.fileUrl,
      fileType: data.fileType,
      fileName: data.originalName,
    };
    if (isGroup) {
      socket.emit("group_message", { groupId: group.id, ...payload });
    } else {
      socket.emit("private_message", { from: me, to: user, ...payload });
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    fileInputRef.current.value = "";
  };

  /* ================= VOICE ================= */
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    audioChunks.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isGroup) {
          socket.emit("group_message", { groupId: group.id, audio: reader.result });
        } else {
          socket.emit("private_message", { from: me, to: user, audio: reader.result });
        }
      };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  /* ================= UI ================= */
  return (
    <>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .recording-dot { animation: pulse 1.5s ease-in-out infinite; }
        .chat-input:focus { border-color: #ff8c42; background: #fff; }
        .call-button:hover { transform: scale(1.05); }
        .back-button { display: none; }
        .send-button:hover, .voice-button:hover { transform: scale(1.1); }
        .send-button:disabled { opacity: 0.5; cursor: not-allowed; }
        audio::-webkit-media-controls-panel { background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%); }
        audio::-webkit-media-controls-current-time-display,
        audio::-webkit-media-controls-time-remaining-display { color: #fff; }
        audio::-webkit-media-controls-play-button,
        audio::-webkit-media-controls-mute-button { filter: invert(1); }
        @media (max-width: 768px) {
          .call-text { display: none; }
          .message-bubble { max-width: 85% !important; }
          .back-button { display: flex !important; }
        }
      `}</style>

      <div style={styles.container}>
        {/* Header */}
        <div style={styles.chatHeader}>
          <div style={styles.userInfo}>
            <button onClick={onBack} style={styles.backButton} className="back-button">←</button>

            {isGroup ? (
              <div
                style={{ ...styles.avatar, cursor: "pointer", background: "linear-gradient(135deg,#ff6b35,#ff8c42)", color: "#fff" }}
                onClick={() => setShowGroupInfo(true)}
                title="Group info"
              >
                {group.avatar ? (
                  <img src={group.avatar} alt={group.name} style={styles.avatarImg} />
                ) : (
                  <span style={{ fontSize: 22 }}>👥</span>
                )}
              </div>
            ) : (
              <div
                style={{ ...styles.avatar, cursor: "pointer" }}
                onClick={() => setShowPeerProfile(true)}
                title={`View ${user}'s profile`}
              >
                {peerProfile?.avatar ? (
                  <img src={peerProfile.avatar} alt={user} style={styles.avatarImg} />
                ) : (
                  <span>{user?.charAt(0).toUpperCase()}</span>
                )}
              </div>
            )}

            <div style={styles.userDetails}>
              <h3 style={styles.userName}>{isGroup ? group.name : user}</h3>
              <span style={styles.statusText}>
                {isGroup ? (
                  <>👥 {group.members.length} member{group.members.length === 1 ? "" : "s"}</>
                ) : (
                  <><span style={styles.ghostIcon}>👻</span> Disappears 24h after seen</>
                )}
              </span>
            </div>
          </div>
          <button onClick={onCall} style={styles.callButton} className="call-button">
            <span style={styles.callIcon}>{isGroup ? "🎥" : "📞"}</span>
            <span className="call-text" style={styles.callText}>
              {isGroup ? "Join call" : "Call"}
            </span>
          </button>
        </div>

        {/* Messages */}
        <div style={styles.messagesContainer}>
          {visibleMessages.map((m, i) => {
            const prev = visibleMessages[i - 1];
            const showDate = !prev || new Date(prev.time).toDateString() !== new Date(m.time).toDateString();
            const remaining = formatRemaining(m.expiresAt, now);

            return (
              <div key={i}>
                {showDate && (
                  <div style={styles.dateSeparator}>
                    <span style={styles.dateText}>{formatDate(m.time)}</span>
                  </div>
                )}

                {m.system ? (
                  <div style={styles.systemMessage}>
                    <span>{m.text}</span>
                    <span style={styles.systemTime}>{formatTime(m.time)}</span>
                  </div>
                ) : (
                  <div style={{ ...styles.messageWrapper, justifyContent: m.from === me ? "flex-end" : "flex-start" }}>
                    {isGroup && m.from !== me && (
                      <div style={styles.bubbleAvatar} title={m.from}>
                        {memberProfiles[m.from]?.avatar ? (
                          <img src={memberProfiles[m.from].avatar} alt={m.from} style={styles.bubbleAvatarImg} />
                        ) : (
                          m.from?.charAt(0).toUpperCase()
                        )}
                      </div>
                    )}
                    <div
                      className="message-bubble"
                      style={{ ...styles.messageBubble, ...(m.from === me ? styles.myMessage : styles.theirMessage) }}
                    >
                      {m.from !== me && <div style={styles.senderName}>{m.from}</div>}

                      {m.audio ? (
                        // ✅ Audio — base64 so no URL fix needed
                        <div style={styles.audioWrapper}>
                          <div style={styles.audioIcon}>🎤</div>
                          <audio controls src={m.audio} style={styles.audio} />
                        </div>

                      ) : m.file ? (
                        m.fileType?.startsWith("image") ? (
                          // ✅ Image — getFileUrl handles full URL or relative path
                          <div style={styles.imageWrapper}>
                            <img
                              src={getFileUrl(m.file)}
                              style={styles.imageMessage}
                              alt="attachment"
                              onError={(e) => {
                                // Debug helper — log the broken URL
                                console.error("Image failed to load:", e.target.src);
                              }}
                              onClick={() => setImageModal(getFileUrl(m.file))}
                            />
                          </div>
                        ) : (
                          // ✅ File download — getFileUrl handles full URL or relative path
                          <a
                            href={getFileUrl(m.file)}
                            download={m.fileName}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.fileLink}
                          >
                            <div style={styles.fileDownloadBox}>
                              <span style={styles.fileIcon}>📄</span>
                              <div style={styles.fileInfo}>
                                <div style={styles.fileNameText}>{m.fileName}</div>
                                <div style={styles.downloadText}>Click to download</div>
                              </div>
                            </div>
                          </a>
                        )
                      ) : (
                        <div style={styles.messageText}>{m.message}</div>
                      )}

                      <div style={styles.messageMeta}>
                        <span style={styles.messageTime}>{formatTime(m.time)}</span>
                        {!isGroup && m.from === me && (
                          <span
                            style={{
                              ...styles.seenTick,
                              color: m.seenAt ? "#60d394" : "rgba(255,255,255,0.55)",
                            }}
                            title={m.seenAt ? "Seen" : "Sent"}
                          >
                            {m.seenAt ? "✓✓" : "✓"}
                          </span>
                        )}
                        {remaining && (
                          <span
                            style={{
                              ...styles.ephemeralBadge,
                              color: m.from === me ? "rgba(255,255,255,0.85)" : "#ff6b35",
                              background:
                                m.from === me
                                  ? "rgba(255,255,255,0.18)"
                                  : "rgba(255,107,53,0.1)",
                            }}
                            title={
                              m.seenAt
                                ? "Disappears 24h after seen"
                                : "Disappears once seen + 24h, or after 7 days"
                            }
                          >
                            ⏳ {remaining}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {visibleMessages.length === 0 && (
            <div style={styles.emptyChat}>
              <div style={styles.emptyChatIcon}>👻</div>
              <p style={styles.emptyChatTitle}>No messages yet</p>
              <p style={styles.emptyChatSub}>
                Say hi! Messages disappear automatically after 24 hours.
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Peer profile viewer */}
        {showPeerProfile && (
          <ProfileViewer
            username={user}
            online
            initial={peerProfile}
            onClose={() => setShowPeerProfile(false)}
          />
        )}

        {/* Group info / members / add-member */}
        {isGroup && showGroupInfo && (
          <GroupInfoModal
            me={me}
            group={group}
            memberProfiles={memberProfiles}
            onClose={() => setShowGroupInfo(false)}
            onGroupUpdated={(g) => { onGroupUpdated?.(g); }}
            onLeft={() => { onLeft?.(); }}
          />
        )}

        {/* Image Modal */}
        {imageModal && (
          <div style={styles.modalOverlay} onClick={() => setImageModal(null)}>
            <div style={styles.modalContent}>
              <button style={styles.modalClose} onClick={() => setImageModal(null)}>✕</button>
              <img src={imageModal} style={styles.modalImage} alt="full size" />
            </div>
          </div>
        )}

        {/* File Preview */}
        {selectedFile && (
          <div style={styles.filePreview}>
            <div style={styles.previewContent}>
              {previewUrl ? (
                <img src={previewUrl} style={styles.previewImage} alt="preview" />
              ) : (
                <div style={styles.filePreviewInfo}>
                  <span style={styles.fileIcon}>📄</span>
                  <span style={styles.fileName}>{selectedFile.name}</span>
                </div>
              )}
              <button
                onClick={() => { setSelectedFile(null); setPreviewUrl(null); fileInputRef.current.value = ""; }}
                style={styles.removeButton}
              >✕</button>
            </div>
          </div>
        )}

        {/* Recording Indicator */}
        {recording && (
          <div style={styles.recordingIndicator}>
            <span className="recording-dot" style={styles.recordingDot}>🔴</span>
            <span style={styles.recordingText}>Recording... Release to send</span>
          </div>
        )}

        {/* Input Area */}
        <div style={styles.inputContainer}>
          <label style={styles.attachButton}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileSelect(e.target.files[0])}
              style={{ display: "none" }}
            />
            📎
          </label>

          <input
            value={msg}
            onChange={(e) => {
              setMsg(e.target.value);
              if (user) {
                socket.emit("typing", { to: user });
              }
            }}
            onKeyPress={(e) => e.key === "Enter" && sendText()}
            placeholder="Type a message..."
            style={styles.input}
            className="chat-input"
          />

          <button
            onClick={() => (selectedFile ? sendFile() : sendText())}
            style={styles.sendButton}
            disabled={!msg.trim() && !selectedFile}
            className="send-button"
          >
            {selectedFile ? "📤" : "➤"}
          </button>

          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            style={{
              ...styles.voiceButton,
              background: recording
                ? "linear-gradient(135deg, #ff3838 0%, #ff5252 100%)"
                : "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
            }}
            className="voice-button"
          >
            🎤
          </button>
        </div>
      </div>
    </>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", height: "100%", background: "#fff" },
  chatHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", boxShadow: "0 2px 10px rgba(255,107,53,0.2)", flexWrap: "wrap", gap: "12px" },
  userInfo: { display: "flex", alignItems: "center", gap: "12px" },
  backButton: { width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: "24px", fontWeight: "700", cursor: "pointer", display: "none", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease" },
  avatar: { width: "48px", height: "48px", borderRadius: "50%", background: "#fff", color: "#ff6b35", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  userDetails: { display: "flex", flexDirection: "column" },
  userName: { margin: 0, color: "#fff", fontSize: "18px", fontWeight: "600" },
  statusText: { fontSize: "13px", color: "rgba(255,255,255,0.85)" },
  callButton: { display: "flex", alignItems: "center", gap: "6px", padding: "10px 20px", background: "rgba(255,255,255,0.95)", color: "#ff6b35", border: "none", borderRadius: "25px", fontSize: "15px", fontWeight: "600", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", transition: "all 0.2s ease" },
  callIcon: { fontSize: "18px" },
  callText: { display: "inline" },
  messagesContainer: { flex: 1, overflowY: "auto", padding: "20px", background: "linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%)", display: "flex", flexDirection: "column", gap: "8px" },
  dateSeparator: { display: "flex", alignItems: "center", justifyContent: "center", margin: "16px 0" },
  dateText: { padding: "6px 16px", background: "rgba(255,107,53,0.1)", color: "#ff6b35", borderRadius: "16px", fontSize: "12px", fontWeight: "600" },
  systemMessage: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "8px", color: "#666", fontSize: "13px", fontStyle: "italic" },
  systemTime: { fontSize: "11px", color: "#999" },
  messageWrapper: { display: "flex", marginBottom: "4px" },
  messageBubble: { maxWidth: "70%", padding: "12px 16px", borderRadius: "18px", position: "relative", wordWrap: "break-word" },
  myMessage: { background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", color: "#fff", borderBottomRightRadius: "4px", boxShadow: "0 2px 6px rgba(255,107,53,0.3)" },
  theirMessage: { background: "#fff", color: "#333", borderBottomLeftRadius: "4px", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" },
  senderName: { fontSize: "12px", fontWeight: "600", color: "#ff6b35", marginBottom: "4px" },
  bubbleAvatar: { width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#ffb088,#ffc7a8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, alignSelf: "flex-end", marginRight: 6, flexShrink: 0, overflow: "hidden" },
  bubbleAvatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  messageText: { lineHeight: "1.4", fontSize: "15px" },
  messageMeta: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", marginTop: "6px", flexWrap: "wrap" },
  messageTime: { fontSize: "10px", opacity: 0.7 },
  ephemeralBadge: { fontSize: "10px", fontWeight: 600, padding: "2px 6px", borderRadius: "10px", whiteSpace: "nowrap" },
  seenTick: { fontSize: "11px", fontWeight: 700, letterSpacing: "1px" },
  ghostIcon: { marginRight: "4px" },
  emptyChat: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px", color: "#666" },
  emptyChatIcon: { fontSize: 56, marginBottom: 12, opacity: 0.6 },
  emptyChatTitle: { margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#333" },
  emptyChatSub: { margin: 0, fontSize: 13, maxWidth: 280 },
  audioWrapper: { display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", background: "rgba(255,255,255,0.15)", borderRadius: "12px", minWidth: "280px" },
  audioIcon: { fontSize: "24px", flexShrink: 0 },
  audio: { flex: 1, height: "36px", outline: "none", borderRadius: "8px" },
  imageWrapper: { position: "relative" },
  imageMessage: { maxWidth: "320px", maxHeight: "400px", width: "100%", height: "auto", borderRadius: "12px", display: "block", marginBottom: "4px", cursor: "pointer", objectFit: "cover", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", transition: "transform 0.2s ease" },
  fileLink: { textDecoration: "none", color: "inherit" },
  fileDownloadBox: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "rgba(255,255,255,0.15)", borderRadius: "12px", border: "2px solid rgba(255,255,255,0.2)", minWidth: "200px", cursor: "pointer", transition: "all 0.2s ease" },
  fileIcon: { fontSize: "32px", flexShrink: 0 },
  fileInfo: { flex: 1, display: "flex", flexDirection: "column", gap: "4px" },
  fileNameText: { fontSize: "14px", fontWeight: "600", wordBreak: "break-word" },
  downloadText: { fontSize: "11px", opacity: 0.7, fontStyle: "italic" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" },
  modalContent: { position: "relative", maxWidth: "90vw", maxHeight: "90vh" },
  modalClose: { position: "absolute", top: "-50px", right: "0", width: "40px", height: "40px", borderRadius: "50%", background: "#ff6b35", color: "#fff", border: "none", fontSize: "24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(255,107,53,0.4)" },
  modalImage: { maxWidth: "100%", maxHeight: "90vh", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" },
  filePreview: { padding: "12px 20px", background: "#fff", borderTop: "1px solid #ffe8d6" },
  previewContent: { display: "flex", alignItems: "center", gap: "12px", padding: "12px", background: "#fff5eb", borderRadius: "12px", border: "2px dashed #ff8c42" },
  previewImage: { width: "80px", height: "80px", objectFit: "cover", borderRadius: "8px" },
  filePreviewInfo: { display: "flex", alignItems: "center", gap: "8px", flex: 1 },
  fileName: { fontSize: "14px", color: "#333", fontWeight: "500" },
  removeButton: { width: "28px", height: "28px", borderRadius: "50%", border: "none", background: "#ff6b35", color: "#fff", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  recordingIndicator: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", background: "linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%)", borderTop: "1px solid #ffe8d6" },
  recordingDot: { fontSize: "16px" },
  recordingText: { color: "#ff3838", fontSize: "14px", fontWeight: "600" },
  inputContainer: { display: "flex", alignItems: "center", gap: "10px", padding: "16px 20px", background: "#fff", borderTop: "2px solid #ffe8d6" },
  attachButton: { width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%)", border: "2px solid #ff8c42", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", cursor: "pointer", transition: "all 0.2s ease" },
  input: { flex: 1, padding: "12px 18px", border: "2px solid #ffe8d6", borderRadius: "25px", fontSize: "15px", outline: "none", background: "#fff5eb", transition: "all 0.2s ease", fontFamily: "inherit" },
  sendButton: { width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", border: "none", color: "#fff", fontSize: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(255,107,53,0.3)", transition: "all 0.2s ease" },
  voiceButton: { width: "44px", height: "44px", borderRadius: "50%", border: "none", color: "#fff", fontSize: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(255,107,53,0.3)", transition: "all 0.2s ease" },
};