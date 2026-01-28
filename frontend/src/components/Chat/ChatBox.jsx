import React, { useEffect, useRef, useState } from "react";
import socket from "../../services/socket";

export default function ChatBox({ user }) {
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState([]);
  const [recording, setRecording] = useState(false);

  const me = localStorage.getItem("username");
  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);

  /* ================= LOAD CHAT ================= */
  useEffect(() => {
    if (!user) return;

    fetch(`http://localhost:5000/api/chat/history/${me}/${user}`)
      .then((res) => res.json())
      .then((data) => setMessages(data));
  }, [user]);

  /* ================= SOCKET LISTENER ================= */
  useEffect(() => {
    const handler = (data) => {
      setMessages((prev) => [...prev, data]);

      if (Notification.permission === "granted") {
        new Notification(`Message from ${data.from}`, {
          body: data.message || "🎤 Voice message",
        });
      }
    };

    socket.on("receive_message", handler);
    return () => socket.off("receive_message", handler);
  }, []);

  /* ================= NOTIFICATION PERMISSION ================= */
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  /* ================= SEND TEXT ================= */
  const send = () => {
    if (!msg.trim()) return;

    const data = { from: me, to: user, message: msg };
    socket.emit("private_message", data);

    setMessages((prev) => [...prev, data]);
    setMsg("");
  };

  /* ================= VOICE RECORD ================= */
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const recorder = new MediaRecorder(stream); // ❌ mimeType mat de
    mediaRecorderRef.current = recorder;
    audioChunks.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(audioChunks.current, {
        type: "audio/webm",
      });

      const reader = new FileReader();
      reader.onloadend = () => {
        socket.emit("voice_message", {
          from: me,
          to: user,
          audio: reader.result,
        });
      };

      reader.readAsDataURL(blob);
    };

    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  /* ================= UI ================= */
  return (
    <div style={{ padding: 20 }}>
      <h3>Chat with {user}</h3>

      {/* CHAT MESSAGES */}
      <div
        style={{
          height: 350,
          overflowY: "auto",
          border: "1px solid #444",
          padding: 10,
          marginBottom: 10,
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <b>{m.from === me ? "You" : m.from}:</b>{" "}
            {m.audio ? (
              <audio controls>
                <source src={m.audio} type="audio/webm" />
              </audio>
            ) : (
              m.message
            )}
          </div>
        ))}
      </div>

      {/* INPUT AREA */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Type message..."
          style={{ flex: 1, padding: 8 }}
        />

        <button onClick={send}>Send</button>

        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          style={{
            background: recording ? "red" : "#222",
            color: "white",
            width: 45,
            borderRadius: "50%",
          }}
        >
          🎤
        </button>
      </div>

      {recording && (
        <p style={{ color: "red", marginTop: 5 }}>
          🎙 Recording... release to send
        </p>
      )}
    </div>
  );
}
