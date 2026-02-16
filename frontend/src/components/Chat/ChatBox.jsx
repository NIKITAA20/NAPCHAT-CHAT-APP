import React, { useEffect, useRef, useState } from "react";
import socket from "../../services/socket";
import API from "../../services/api";

// ✅ FIX: Full URL for uploaded files
const BASE_URL = import.meta.env.VITE_API_BASE_URL.replace("/api", "");

const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatDate = (ts) => {
  const d = new Date(ts);
  const today = new Date();

  const isToday = d.toDateString() === today.toDateString();

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";

  return d.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function ChatBox({ user, onCall, onBack }) {
  const me = localStorage.getItem("username");

  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState("");
  const [recording, setRecording] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageModal, setImageModal] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  /* ================= LOAD CHAT ================= */
  useEffect(() => {
    if (!user) return;

    API.get(`/chat/history/${me}/${user}`)
      .then((res) => setMessages(res.data))
      .catch(console.error);

    socket.emit("clear_unread", { me, other: user });
  }, [user]);

  /* ================= SOCKET LISTENER ================= */
  useEffect(() => {
    const handler = (data) => {
      if (data.system) {
        setMessages((prev) => [...prev, data]);
        return;
      }

      if (
        (data.from === me && data.to === user) ||
        (data.from === user && data.to === me)
      ) {
        setMessages((prev) => [...prev, data]);
      }
    };

    socket.on("receive_message", handler);
    return () => socket.off("receive_message", handler);
  }, [user]);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ================= SEND TEXT ================= */
  const sendText = () => {
    if (!msg.trim()) return;

    socket.emit("private_message", {
      from: me,
      to: user,
      message: msg,
    });

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

    socket.emit("private_message", {
      from: me,
      to: user,
      file: data.fileUrl,
      fileType: data.fileType,
      fileName: data.originalName,
    });

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

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });

      const reader = new FileReader();
      reader.onloadend = () => {
        socket.emit("private_message", {
          from: me,
          to: user,
          audio: reader.result,
        });
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
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .recording-dot {
          animation: pulse 1.5s ease-in-out infinite;
        }
        .chat-input:focus {
          border-color: #ff8c42;
          background: #fff;
        }
        .call-button:hover {
          transform: scale(1.05);
        }
        .back-button {
          display: none;
        }
        .send-button:hover, .voice-button:hover {
          transform: scale(1.1);
        }
        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        /* Custom Audio Player Styling */
        audio::-webkit-media-controls-panel {
          background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
        }
        audio::-webkit-media-controls-current-time-display,
        audio::-webkit-media-controls-time-remaining-display {
          color: #fff;
        }
        audio::-webkit-media-controls-play-button,
        audio::-webkit-media-controls-mute-button {
          filter: invert(1);
        }
        
        @media (max-width: 768px) {
          .call-text {
            display: none;
          }
          .message-bubble {
            max-width: 85% !important;
          }
          .back-button {
            display: flex !important;
          }
        }
      `}</style>

      <div style={styles.container}>
        {/* Chat Header */}
        <div style={styles.chatHeader}>
          <div style={styles.userInfo}>
            <button
              onClick={onBack}
              style={styles.backButton}
              className="back-button"
            >
              ←
            </button>
            <div style={styles.avatar}>{user?.charAt(0).toUpperCase()}</div>
            <div style={styles.userDetails}>
              <h3 style={styles.userName}>{user}</h3>
              <span style={styles.statusText}>Active now</span>
            </div>
          </div>
          <button onClick={onCall} style={styles.callButton} className="call-button">
            <span style={styles.callIcon}>📞</span>
            <span className="call-text" style={styles.callText}>Call</span>
          </button>
        </div>

        {/* Messages Area */}
        <div style={styles.messagesContainer}>
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showDate =
              !prev ||
              new Date(prev.time).toDateString() !==
                new Date(m.time).toDateString();

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
                  <div
                    style={{
                      ...styles.messageWrapper,
                      justifyContent: m.from === me ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      className="message-bubble"
                      style={{
                        ...styles.messageBubble,
                        ...(m.from === me ? styles.myMessage : styles.theirMessage),
                      }}
                    >
                      {m.from !== me && (
                        <div style={styles.senderName}>{m.from}</div>
                      )}

                      {m.audio ? (
                        <div style={styles.audioWrapper}>
                          <div style={styles.audioIcon}>🎤</div>
                          <audio controls src={m.audio} style={styles.audio} />
                        </div>
                      ) : m.file ? (
                        // ✅ FIX: fileType check + BASE_URL prepended
                        m.fileType?.startsWith("image") ? (
                          <div style={styles.imageWrapper}>
                            <img
                              src={`${BASE_URL}${m.file}`}
                              style={styles.imageMessage}
                              alt="attachment"
                              onClick={() => setImageModal(`${BASE_URL}${m.file}`)}
                            />
                          </div>
                        ) : (
                          // ✅ FIX: href with BASE_URL + download attr
                          <a
                            href={`${BASE_URL}${m.file}`}
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

                      <div style={styles.messageTime}>{formatTime(m.time)}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Image Modal — ✅ FIX: uses full URL already set in state */}
        {imageModal && (
          <div style={styles.modalOverlay} onClick={() => setImageModal(null)}>
            <div style={styles.modalContent}>
              <button
                style={styles.modalClose}
                onClick={() => setImageModal(null)}
              >
                ✕
              </button>
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
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  fileInputRef.current.value = "";
                }}
                style={styles.removeButton}
              >
                ✕
              </button>
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
            onChange={(e) => setMsg(e.target.value)}
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
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#fff",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    boxShadow: "0 2px 10px rgba(255, 107, 53, 0.2)",
    flexWrap: "wrap",
    gap: "12px",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  backButton: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "rgba(255, 255, 255, 0.2)",
    border: "none",
    color: "#fff",
    fontSize: "24px",
    fontWeight: "700",
    cursor: "pointer",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
  },
  avatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: "#fff",
    color: "#ff6b35",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
    fontSize: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  userDetails: {
    display: "flex",
    flexDirection: "column",
  },
  userName: {
    margin: 0,
    color: "#fff",
    fontSize: "18px",
    fontWeight: "600",
  },
  statusText: {
    fontSize: "13px",
    color: "rgba(255, 255, 255, 0.85)",
  },
  callButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "10px 20px",
    background: "rgba(255, 255, 255, 0.95)",
    color: "#ff6b35",
    border: "none",
    borderRadius: "25px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    transition: "all 0.2s ease",
  },
  callIcon: {
    fontSize: "18px",
  },
  callText: {
    display: "inline",
  },
  messagesContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "20px",
    background: "linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  dateSeparator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "16px 0",
  },
  dateText: {
    padding: "6px 16px",
    background: "rgba(255, 107, 53, 0.1)",
    color: "#ff6b35",
    borderRadius: "16px",
    fontSize: "12px",
    fontWeight: "600",
  },
  systemMessage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    padding: "8px",
    color: "#666",
    fontSize: "13px",
    fontStyle: "italic",
  },
  systemTime: {
    fontSize: "11px",
    color: "#999",
  },
  messageWrapper: {
    display: "flex",
    marginBottom: "4px",
  },
  messageBubble: {
    maxWidth: "70%",
    padding: "12px 16px",
    borderRadius: "18px",
    position: "relative",
    wordWrap: "break-word",
  },
  myMessage: {
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    color: "#fff",
    borderBottomRightRadius: "4px",
    boxShadow: "0 2px 6px rgba(255, 107, 53, 0.3)",
  },
  theirMessage: {
    background: "#fff",
    color: "#333",
    borderBottomLeftRadius: "4px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  },
  senderName: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#ff6b35",
    marginBottom: "4px",
  },
  messageText: {
    lineHeight: "1.4",
    fontSize: "15px",
  },
  messageTime: {
    fontSize: "10px",
    marginTop: "6px",
    opacity: 0.7,
    textAlign: "right",
  },
  audioWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 12px",
    background: "rgba(255, 255, 255, 0.15)",
    borderRadius: "12px",
    minWidth: "280px",
  },
  audioIcon: {
    fontSize: "24px",
    flexShrink: 0,
  },
  audio: {
    flex: 1,
    height: "36px",
    outline: "none",
    borderRadius: "8px",
  },
  imageWrapper: {
    position: "relative",
  },
  imageMessage: {
    maxWidth: "320px",
    maxHeight: "400px",
    width: "100%",
    height: "auto",
    borderRadius: "12px",
    display: "block",
    marginBottom: "4px",
    cursor: "pointer",
    objectFit: "cover",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "transform 0.2s ease",
  },
  fileLink: {
    textDecoration: "none",
    color: "inherit",
  },
  fileDownloadBox: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    background: "rgba(255, 255, 255, 0.15)",
    borderRadius: "12px",
    border: "2px solid rgba(255, 255, 255, 0.2)",
    minWidth: "200px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  fileIcon: {
    fontSize: "32px",
    flexShrink: 0,
  },
  fileInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  fileNameText: {
    fontSize: "14px",
    fontWeight: "600",
    wordBreak: "break-word",
  },
  downloadText: {
    fontSize: "11px",
    opacity: 0.7,
    fontStyle: "italic",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "20px",
  },
  modalContent: {
    position: "relative",
    maxWidth: "90vw",
    maxHeight: "90vh",
  },
  modalClose: {
    position: "absolute",
    top: "-50px",
    right: "0",
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "#ff6b35",
    color: "#fff",
    border: "none",
    fontSize: "24px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(255, 107, 53, 0.4)",
  },
  modalImage: {
    maxWidth: "100%",
    maxHeight: "90vh",
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
  },
  filePreview: {
    padding: "12px 20px",
    background: "#fff",
    borderTop: "1px solid #ffe8d6",
  },
  previewContent: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px",
    background: "#fff5eb",
    borderRadius: "12px",
    border: "2px dashed #ff8c42",
  },
  previewImage: {
    width: "80px",
    height: "80px",
    objectFit: "cover",
    borderRadius: "8px",
  },
  filePreviewInfo: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
  },
  fileName: {
    fontSize: "14px",
    color: "#333",
    fontWeight: "500",
  },
  removeButton: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    border: "none",
    background: "#ff6b35",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingIndicator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "12px",
    background: "linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%)",
    borderTop: "1px solid #ffe8d6",
  },
  recordingDot: {
    fontSize: "16px",
  },
  recordingText: {
    color: "#ff3838",
    fontSize: "14px",
    fontWeight: "600",
  },
  inputContainer: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "16px 20px",
    background: "#fff",
    borderTop: "2px solid #ffe8d6",
  },
  attachButton: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%)",
    border: "2px solid #ff8c42",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  input: {
    flex: 1,
    padding: "12px 18px",
    border: "2px solid #ffe8d6",
    borderRadius: "25px",
    fontSize: "15px",
    outline: "none",
    background: "#fff5eb",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
  },
  sendButton: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    border: "none",
    color: "#fff",
    fontSize: "20px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(255, 107, 53, 0.3)",
    transition: "all 0.2s ease",
  },
  voiceButton: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "none",
    color: "#fff",
    fontSize: "20px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(255, 107, 53, 0.3)",
    transition: "all 0.2s ease",
  },
};