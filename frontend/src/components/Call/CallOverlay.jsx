import React, { useEffect, useRef, useState } from "react";
import socket from "../../services/socket";
import ringtone from "../../assets/ringtone.mp3";

export default function CallOverlay({ user, incoming, offer, onClose, initialStream = null }) {
  const me = localStorage.getItem("username");

  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const pc = useRef(null);
  const streamRef = useRef(null);
  const pendingCandidates = useRef([]);

  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [remoteVideoOn, setRemoteVideoOn] = useState(true);
  const [remoteStream, setRemoteStream] = useState(null);
  // bumped on every ontrack so the attach-effect re-runs even when
  // the underlying MediaStream reference is the same across events.
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [unreadDot, setUnreadDot] = useState(false);
  const [callMsg, setCallMsg] = useState("");
  const [callMessages, setCallMessages] = useState([]);
  const [callDuration, setCallDuration] = useState(0);
  const [isInCall, setIsInCall] = useState(false);
  const [callStatus, setCallStatus] = useState(incoming ? "connecting" : "calling");
  const callStatusRef = useRef(incoming ? "connecting" : "calling"); // ✅ ref mirrors state — no stale closure in timeouts

  const ringtoneRef = useRef(null);
  const callTimeoutRef = useRef(null);
  // Guards against duplicate end-call emits + cleanup re-entry
  // (failed/closed state changes can fire multiple times on mobile).
  const endNotifiedRef = useRef(false);
  const cleanedUpRef = useRef(false);
  const failedGraceTimerRef = useRef(null);
  const cameraBusyRef = useRef(false);
  const [localCameraBusy, setLocalCameraBusy] = useState(false);
  // Accumulate remote tracks — audio often arrives before video on the
  // same or different ontrack events.
  const remoteStreamRef = useRef(null);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const stopLocalStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
  };

  /* ========== RINGTONE HELPER ========== */
  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  };

  const startTimer = () => {
    if (!pc.current || pc.current._timer) return;
    pc.current._timer = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
  };

  /* ========== PEER ========== */
  const createPeer = () => {
    if (pc.current) return;

    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ];

    if (turnUsername && turnCredential) {
      iceServers.push(
        {
          urls: "turn:a.relay.metered.ca:80",
          username: turnUsername,
          credential: turnCredential,
        },
        {
          urls: "turn:a.relay.metered.ca:80?transport=tcp",
          username: turnUsername,
          credential: turnCredential,
        },
        {
          urls: "turn:a.relay.metered.ca:443",
          username: turnUsername,
          credential: turnCredential,
        },
        {
          urls: "turn:a.relay.metered.ca:443?transport=tcp",
          username: turnUsername,
          credential: turnCredential,
        }
      );
    } else {
      console.warn("⚠️ TURN credentials not found - using STUN only.");
    }

    pc.current = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
    });

    pc.current.onconnectionstatechange = () => {
      const state = pc.current?.connectionState;
      console.log("🔗 Connection state:", state);
      // "disconnected" is transient (mobile network hiccups) — give it
      // a chance to recover. Only terminal states warrant teardown.
      if (state === "failed") {
        // Mobile can briefly hit "failed" during ICE renegotiation.
        // Give it a short grace window before we tear down.
        if (failedGraceTimerRef.current) clearTimeout(failedGraceTimerRef.current);
        const peerSession = pc.current;
        failedGraceTimerRef.current = setTimeout(() => {
          if (!pc.current || pc.current !== peerSession) return;
          if (pc.current?.connectionState === "failed" || pc.current?.iceConnectionState === "failed") {
            notifyPeerEnd();
            cleanup();
          }
        }, 5000);
      } else if (state === "closed") {
        if (failedGraceTimerRef.current) clearTimeout(failedGraceTimerRef.current);
        failedGraceTimerRef.current = null;
        cleanup();
      }
    };

    pc.current.oniceconnectionstatechange = () => {
      const ice = pc.current?.iceConnectionState;
      console.log("🧊 ICE state:", ice);
      // Some mobile browsers (esp. iOS Safari) don't reliably transition
      // connectionState → "failed", but iceConnectionState does.
      if (ice === "failed") {
        if (failedGraceTimerRef.current) clearTimeout(failedGraceTimerRef.current);
        const peerSession = pc.current;
        failedGraceTimerRef.current = setTimeout(() => {
          if (!pc.current || pc.current !== peerSession) return;
          if (pc.current?.iceConnectionState === "failed") {
            notifyPeerEnd();
            cleanup();
          }
        }, 5000);
      } else {
        if (failedGraceTimerRef.current) clearTimeout(failedGraceTimerRef.current);
        failedGraceTimerRef.current = null;
      }
    };

    // ✅ DEBUG: Track ICE gathering progress
    pc.current.onicegatheringstatechange = () => {
      console.log("📡 ICE gathering:", pc.current.iceGatheringState);
    };

    pc.current.ontrack = (event) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();

      const stream = remoteStreamRef.current;
      const already = stream.getTracks().some((t) => t.id === event.track.id);
      if (!already) stream.addTrack(event.track);

      console.log("📡 Remote stream received", stream.getTracks());

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      console.log("📹 Video tracks:", videoTracks.length);
      console.log("🔊 Audio tracks:", audioTracks.length);

      setRemoteStream(stream);
      setRemoteStreamVersion((v) => v + 1);

      const hasLiveVideo = videoTracks.some((t) => t.readyState !== "ended");
      setRemoteVideoOn(hasLiveVideo);
    };

    pc.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: user, candidate: event.candidate });
      }
    };
  };

  /** Try several constraint sets; Windows often needs a short delay after stop(). */
  const acquireLocalMedia = async () => {
    stopLocalStream();
    await sleep(400);

    const attempts = [
      () => navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } }),
      () => navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
      () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    ];

    for (let round = 0; round < 3; round++) {
      for (const attempt of attempts) {
        try {
          return await attempt();
        } catch (err) {
          const retryable =
            err?.name === "NotReadableError" ||
            err?.name === "OverconstrainedError" ||
            err?.name === "AbortError";
          if (!retryable) throw err;
        }
      }
      await sleep(600 * (round + 1));
    }
    return null;
  };

  const attachLocalStreamToPeer = () => {
    if (!streamRef.current || !pc.current) return;
    streamRef.current.getTracks().forEach((t) => {
      const exists = pc.current.getSenders().some((s) => s.track?.id === t.id);
      if (!exists) pc.current.addTrack(t, streamRef.current);
    });
  };

  /** Acquire a video track and attach it to our outgoing stream + peer connection. */
  const addCameraTrack = async () => {
    if (!pc.current || cameraBusyRef.current) return false;
    if (streamRef.current?.getVideoTracks().some((t) => t.readyState === "live")) return true;

    for (let i = 0; i < 2; i++) {
      await sleep(800 * (i + 1));
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        const vt = vStream.getVideoTracks()[0];
        if (!vt) continue;

        if (!streamRef.current) streamRef.current = new MediaStream();
        const oldV = streamRef.current.getVideoTracks()[0];
        if (oldV) {
          oldV.stop();
          streamRef.current.removeTrack(oldV);
        }
        streamRef.current.addTrack(vt);

        const sender = pc.current.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(vt);
        else pc.current.addTrack(vt, streamRef.current);

        setVideoOn(true);
        if (localVideo.current) localVideo.current.srcObject = streamRef.current;
        setLocalCameraBusy(false);
        return true;
      } catch (err) {
        if (i === 1) {
          cameraBusyRef.current = true;
          setLocalCameraBusy(true);
          console.warn("📷 Camera unavailable (device in use). Call continues audio-only.");
        }
      }
    }
    return false;
  };

  /** Mid-call: add camera then re-offer so peer starts receiving video. */
  const renegotiateForCamera = async () => {
    const added = await addCameraTrack();
    if (!added || !pc.current) return false;
    try {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      socket.emit("call-renegotiate", { to: user, offer });
      console.log("📷 Camera enabled + renegotiation offer sent");
      return true;
    } catch (err) {
      console.error("Renegotiate offer failed:", err);
      return false;
    }
  };

  const startMedia = async () => {
    try {
      streamRef.current = await acquireLocalMedia();
    } catch (err) {
      console.error("❌ getUserMedia failed:", err);
      alert("Microphone/camera permission is required for calls.");
      return false;
    }

    if (!streamRef.current) {
      console.warn("⚠️ Continuing without local media");
      return false;
    }

    const hasVideo = streamRef.current.getVideoTracks().length > 0;
    setVideoOn(hasVideo);
    setAudioOn(streamRef.current.getAudioTracks().length > 0);

    if (localVideo.current) localVideo.current.srcObject = streamRef.current;
    attachLocalStreamToPeer();
    return hasVideo;
  };

  /* ========== OUTGOING CALL ========== */
  const startCall = async () => {
    if (pc.current) return; // ✅ FIX: use pc.current check — isInCall can block offer creation
    setIsInCall(true);
    createPeer();
    const hasVideo = await startMedia();
    if (!pc.current) return;
    if (!hasVideo) await addCameraTrack();
    attachLocalStreamToPeer();
    const off = await pc.current.createOffer();
    await pc.current.setLocalDescription(off);
    socket.emit("call-user", { to: user, offer: off });
  };

  const connectingRef = useRef(false);

  /* ========== INCOMING CALL ========== */
  const connectIncoming = async () => {
    console.log("📲 connectIncoming called | connectingRef:", connectingRef.current, "| pc.current:", !!pc.current);
    if (connectingRef.current || pc.current) return; // ✅ FIX: pc.current is real source of truth, not React state
    connectingRef.current = true;

    setIsInCall(true);
    createPeer();

    let hasVideo = false;
    if (initialStream) {
      streamRef.current = initialStream;
      hasVideo = initialStream.getVideoTracks().length > 0;
      setVideoOn(hasVideo);
      setAudioOn(initialStream.getAudioTracks().length > 0);
      setLocalCameraBusy(!hasVideo);
      cameraBusyRef.current = !hasVideo;
      if (localVideo.current) localVideo.current.srcObject = initialStream;
      attachLocalStreamToPeer();
    } else {
      hasVideo = await startMedia();
      if (!hasVideo) {
        cameraBusyRef.current = true;
        setLocalCameraBusy(true);
      }
    }

    try {
      console.log("📋 offer received:", offer?.type, "| sdp length:", offer?.sdp?.length);
      await pc.current.setRemoteDescription(new RTCSessionDescription(offer));

      if (!hasVideo && !cameraBusyRef.current) {
        await addCameraTrack();
        attachLocalStreamToPeer();
        hasVideo = !!streamRef.current?.getVideoTracks().length;
      }

      const ans = await pc.current.createAnswer();
      await pc.current.setLocalDescription(ans);

      socket.emit("answer-call", { to: user, answer: ans });

      // Flush pending ICE candidates after remote description is set
      for (const c of pendingCandidates.current) {
        try {
          await pc.current.addIceCandidate(c);
        } catch (err) {
          console.log("Pending ICE add error:", err);
        }
      }
      pendingCandidates.current = [];

      // Mark receiver side as in-call immediately after answering
      setCallStatus("in-call");
      callStatusRef.current = "in-call";
      setIsInCall(true);
      startTimer();
    } catch (err) {
      console.error("❌ Incoming connect error:", err);
      connectingRef.current = false;
    }
  };

  /* ========== SOCKET EVENTS ========== */

  const showChatRef = useRef(showChat);
  useEffect(() => { showChatRef.current = showChat; }, [showChat]);

  useEffect(() => {
    socket.on("ice-candidate", async ({ candidate }) => {
      if (!pc.current || !pc.current.remoteDescription) {
        pendingCandidates.current.push(candidate);
        return;
      }
      try {
        await pc.current.addIceCandidate(candidate);
      } catch (err) {
        console.error("ICE error:", err);
      }
    });

    socket.on("call-accepted", async ({ answer }) => {
      if (!pc.current) return;
      console.log("✅ call-accepted received | answer type:", answer?.type);
      clearTimeout(callTimeoutRef.current);
      stopRingtone();
      await pc.current.setRemoteDescription(answer);

      // Flush pending ICE candidates after remote description is set
      if (pendingCandidates.current.length) {
        for (const c of pendingCandidates.current) {
          try { await pc.current.addIceCandidate(c); }
          catch (err) { console.log("ICE add error:", err); }
        }
        pendingCandidates.current = [];
      }

      // Mark caller side as in-call and start timer
      setCallStatus("in-call"); callStatusRef.current = "in-call";
      setIsInCall(true);
      startTimer();
    });

    socket.on("user-busy", () => {
      alert("User is already in another call.");
      cleanup();
    });

    socket.on("call-ended", cleanup);

    socket.on("call_message", (data) => {
      setCallMessages((prev) => [...prev, data]);
      if (!showChatRef.current && data.from !== me) setUnreadDot(true);
    });

    socket.on("missed-call", () => {
      alert("Call was not answered.");
      cleanup();
    });

    socket.on("call-renegotiate", async ({ from, offer: reoffer }) => {
      if (from !== user || !pc.current || !reoffer) return;
      try {
        await pc.current.setRemoteDescription(new RTCSessionDescription(reoffer));
        const ans = await pc.current.createAnswer();
        await pc.current.setLocalDescription(ans);
        socket.emit("call-renegotiate-answer", { to: user, answer: ans });
      } catch (err) {
        console.error("Renegotiate (answer side) failed:", err);
      }
    });

    socket.on("call-renegotiate-answer", async ({ answer }) => {
      if (!pc.current || !answer) return;
      try {
        await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error("Renegotiate answer apply failed:", err);
      }
    });

    return () => {
      socket.off("call-accepted");
      socket.off("ice-candidate");
      socket.off("call-ended");
      socket.off("call_message");
      socket.off("missed-call");
      socket.off("user-busy");
      socket.off("call-renegotiate");
      socket.off("call-renegotiate-answer");
    };
  }, []); // ✅ FIX: empty deps — never re-registers listeners

  useEffect(() => {
    if (incoming) return;
    startCall();
    callTimeoutRef.current = setTimeout(() => {
      const isAnswered =
        callStatusRef.current === "in-call" ||
        (pc.current && (
          pc.current.connectionState === "connected" ||
          pc.current.iceConnectionState === "connected" ||
          pc.current.iceConnectionState === "completed"
        ));

      if (!isAnswered) {
        socket.emit("missed-call", { to: user });
        alert("Call not answered ❌");
        cleanup();
      }
    }, 20000);
    return () => clearTimeout(callTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!incoming) return;
    connectIncoming();
  }, []);

  // If we joined audio-only because camera was busy, keep retrying in-call.
  useEffect(() => {
    if (videoOn || !isInCall || cameraBusyRef.current) return;
    const t = setTimeout(() => {
      renegotiateForCamera();
    }, 3000);
    return () => clearTimeout(t);
  }, [videoOn, isInCall]);


  useEffect(() => {
    const el = remoteVideo.current;
    if (!el || !remoteStream) return;

    if (el.srcObject !== remoteStream) {
      el.srcObject = remoteStream;
      el.muted = false;
      console.log("✅ Remote stream attached to <video>");
    }

    // Some browsers don't autoplay reliably after srcObject swap
    const p = el.play?.();
    if (p && typeof p.then === "function") p.catch(() => {});
  }, [remoteStream, remoteStreamVersion, remoteVideoOn]);

  /* ========== CONTROLS ========== */
  const toggleAudio = () => {
    const t = streamRef.current?.getAudioTracks?.()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setAudioOn(t.enabled);
  };

  const toggleVideo = async () => {
    const t = streamRef.current?.getVideoTracks?.()[0];
    if (!t) {
      await renegotiateForCamera();
      return;
    }
    t.enabled = !t.enabled;
    setVideoOn(t.enabled);
  };

  // Emits end-call exactly once per session. Used by both the manual
  // End Call button and the connection-failure path so the peer (and
  // server's activeCalls map) never gets left in a stuck "in-call" state.
  const notifyPeerEnd = () => {
    if (endNotifiedRef.current) return;
    endNotifiedRef.current = true;
    socket.emit("end-call", { to: user });
  };

  const cleanup = () => {
    if (cleanedUpRef.current) return; // pc.close() → onconnectionstatechange("closed") re-fires cleanup
    cleanedUpRef.current = true;

    if (failedGraceTimerRef.current) clearTimeout(failedGraceTimerRef.current);
    failedGraceTimerRef.current = null;

    setIsInCall(false);
    connectingRef.current = false;
    clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    stopRingtone();
    stopLocalStream();
    remoteStreamRef.current = null;
    setRemoteStream(null);
    if (pc.current?._timer) clearInterval(pc.current._timer);
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    onClose();
  };

  const endCall = () => {
    notifyPeerEnd();
    cleanup();
  };

  const sendCallMessage = () => {
    if (!callMsg.trim()) return;
    socket.emit("call_message", { to: user, from: me, message: callMsg, time: Date.now() });
    setCallMsg("");
  };

  const sendCallFile = (file) => {
    const r = new FileReader();
    r.onload = () =>
      socket.emit("call_message", {
        to: user,
        from: me,
        file: r.result,
        fileName: file.name,
        time: Date.now(),
      });
    r.readAsDataURL(file);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  /* ========== RENDER ========== */
  return (
    <>
      <audio ref={ringtoneRef} src={ringtone} loop />

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .chat-sidebar { animation: slideInRight 0.3s ease-out; }
        .control-button { transition: all 0.2s ease; }
        .control-button:hover { transform: scale(1.1); }
        .control-button:active { transform: scale(0.95); }
        .unread-dot { animation: pulse 2s ease-in-out infinite; }
        .camera-off-avatar { animation: float 3s ease-in-out infinite; }
        @media (max-width: 768px) {
          .chat-sidebar { width: 100% !important; position: fixed !important; top: 0 !important; right: 0 !important; height: 100% !important; z-index: 10000 !important; }
          .local-video-container { width: 100px !important; height: 140px !important; right: 10px !important; bottom: 140px !important; }
          .controls-container { flex-wrap: wrap !important; gap: 8px !important; padding: 12px !important; }
          .control-button { padding: 12px 16px !important; font-size: 13px !important; }
        }
      `}</style>

      <div style={styles.overlay}>
        <div
          style={{
            flex: showChat ? "0 0 calc(100% - 380px)" : "1",
            transition: "all 0.25s ease",
            position: "relative",
            minWidth: 0,
          }}
        >
          {/* Remote Video or Avatar
              NOTE: <video> stays mounted always so the ref + srcObject
              survive across remoteVideoOn toggles. We only hide it. */}
          <div style={styles.remoteContainer}>
            <video
              ref={remoteVideo}
              autoPlay
              playsInline
              style={{
                ...styles.remote,
                display: remoteVideoOn ? "block" : "none",
              }}
            />
            {!remoteVideoOn && (
              <div style={styles.cameraOffContainer}>
                <div className="camera-off-avatar" style={styles.cameraOffAvatar}>
                  {user?.charAt(0).toUpperCase()}
                </div>
                <p style={styles.cameraOffText}>{user}</p>
                <p style={styles.cameraOffSubtext}>Camera is off</p>
              </div>
            )}
          </div>

          {/* Local Video — same trick: keep mounted, toggle visibility */}
          <div className="local-video-container" style={styles.localContainer}>
            <video
              ref={localVideo}
              autoPlay
              muted
              playsInline
              style={{
                ...styles.local,
                display: videoOn ? "block" : "none",
              }}
            />
            {!videoOn && (
              <div style={styles.localCameraOff}>
                <div style={styles.localCameraOffAvatar}>{me?.charAt(0).toUpperCase()}</div>
                {localCameraBusy && (
                  <div style={styles.localBusyHint}>Camera busy</div>
                )}
              </div>
            )}
          </div>

          {/* Top Bar */}
          <div style={styles.topBar}>
            <div style={styles.topBarLeft}>
              <div style={styles.userAvatar}>{user?.charAt(0).toUpperCase()}</div>
              <div style={styles.userInfo}>
                <div style={styles.userName}>{user}</div>
                <div style={styles.callStatus}>
                  <span style={styles.statusDot}>●</span>
                  <span>
                    {callStatus === "calling"
                      ? "Calling..."
                      : callStatus === "connecting"
                      ? "Connecting..."
                      : formatDuration(callDuration)}
                  </span>
                </div>
              </div>
            </div>
            <div style={styles.brandTag}>
              <span style={styles.brandIcon}>💬</span>
              <span style={styles.brandText}>NAPCHAT</span>
            </div>
          </div>

          {/* Controls */}
          <div className="controls-container" style={styles.controls}>
            <button
              onClick={toggleAudio}
              className="control-button"
              style={{
                ...styles.controlButton,
                background: audioOn ? "rgba(255,255,255,0.95)" : "linear-gradient(135deg,#ef4444,#dc2626)",
                color: audioOn ? "#333" : "#fff",
              }}
            >
              <span style={styles.controlIcon}>{audioOn ? "🎤" : "🔇"}</span>
              <span style={styles.controlText}>{audioOn ? "Mute" : "Unmute"}</span>
            </button>

            <button
              onClick={toggleVideo}
              className="control-button"
              style={{
                ...styles.controlButton,
                background: videoOn ? "rgba(255,255,255,0.95)" : "linear-gradient(135deg,#ef4444,#dc2626)",
                color: videoOn ? "#333" : "#fff",
              }}
            >
              <span style={styles.controlIcon}>📷</span>
              <span style={styles.controlText}>Camera</span>
            </button>

            <button
              onClick={() => {
                setShowChat(!showChat);
                setUnreadDot(false);
              }}
              className="control-button"
              style={{ ...styles.controlButton, background: "rgba(255,255,255,0.95)", color: "#333", position: "relative" }}
            >
              <span style={styles.controlIcon}>💬</span>
              <span style={styles.controlText}>Chat</span>
              {unreadDot && <span className="unread-dot" style={styles.unreadBadge} />}
            </button>

            <button
              onClick={endCall}
              className="control-button"
              style={{ ...styles.controlButton, background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", minWidth: "120px" }}
            >
              <span style={styles.controlIcon}>📞</span>
              <span style={styles.controlText}>End Call</span>
            </button>
          </div>
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <div className="chat-sidebar" style={styles.chatSidebar}>
            <div style={styles.chatHeader}>
              <h3 style={styles.chatTitle}>In-Call Chat</h3>
              <button onClick={() => setShowChat(false)} style={styles.closeChatButton}>
                ✕
              </button>
            </div>
            <div style={styles.chatList}>
              {callMessages.length === 0 ? (
                <div style={styles.emptyChatState}>
                  <span style={styles.emptyChatIcon}>💬</span>
                  <p style={styles.emptyChatText}>No messages yet</p>
                </div>
              ) : (
                callMessages.map((m, i) => (
                  <div
                    key={i}
                    style={{ ...styles.chatMessage, alignSelf: m.from === me ? "flex-end" : "flex-start" }}
                  >
                    <div
                      style={{
                        ...styles.messageBubble,
                        background:
                          m.from === me ? "linear-gradient(135deg,#ff6b35,#ff8c42)" : "#f5f5f5",
                        color: m.from === me ? "#fff" : "#333",
                      }}
                    >
                      <div style={styles.messageFrom}>{m.from === me ? "You" : m.from}</div>
                      {m.file ? (
                        <a
                          href={m.file}
                          download={m.fileName}
                          style={{ ...styles.fileLink, color: m.from === me ? "#fff" : "#ff6b35" }}
                        >
                          <span style={styles.fileIcon}>📎</span>
                          <span>{m.fileName}</span>
                        </a>
                      ) : (
                        <div style={styles.messageText}>{m.message}</div>
                      )}
                      <div style={styles.messageTime}>
                        {new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={styles.chatInputBar}>
              <label style={styles.attachButton}>
                <input type="file" hidden onChange={(e) => sendCallFile(e.target.files[0])} />
                📎
              </label>
              <input
                value={callMsg}
                onChange={(e) => setCallMsg(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendCallMessage()}
                placeholder="Send a message..."
                style={styles.chatInput}
              />
              <button onClick={sendCallMessage} style={styles.sendBtn}>
                ➤
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%)", zIndex: 9999, display: "flex" },
  remoteContainer: { width: "100%", height: "100%", position: "relative" },
  remote: { width: "100%", height: "100%", objectFit: "cover" },
  cameraOffContainer: { width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)" },
  cameraOffAvatar: { width: "200px", height: "200px", borderRadius: "50%", background: "rgba(255,255,255,0.95)", color: "#ff6b35", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "100px", fontWeight: "800", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", border: "8px solid rgba(255,255,255,0.3)" },
  cameraOffText: { marginTop: "30px", color: "#fff", fontSize: "32px", fontWeight: "700", textShadow: "0 4px 12px rgba(0,0,0,0.2)" },
  cameraOffSubtext: { color: "rgba(255,255,255,0.9)", fontSize: "18px", fontWeight: "500", marginTop: "8px" },
  localContainer: { position: "absolute", right: 20, bottom: 120, width: 160, height: 220, borderRadius: 20, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", border: "4px solid rgba(255,107,53,0.9)" },
  local: { width: "100%", height: "100%", objectFit: "cover" },
  localCameraOff: { width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)" },
  localCameraOffAvatar: { width: "80px", height: "80px", borderRadius: "50%", background: "#fff", color: "#ff6b35", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "36px", fontWeight: "800", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" },
  localBusyHint: { color: "#fff", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.95 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, padding: "20px 24px", background: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 },
  topBarLeft: { display: "flex", alignItems: "center", gap: "12px" },
  userAvatar: { width: "48px", height: "48px", borderRadius: "50%", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "700", boxShadow: "0 4px 12px rgba(255,107,53,0.4)" },
  userInfo: { display: "flex", flexDirection: "column", gap: "4px" },
  userName: { color: "#fff", fontSize: "18px", fontWeight: "600", textShadow: "0 2px 4px rgba(0,0,0,0.3)" },
  callStatus: { display: "flex", alignItems: "center", gap: "6px", color: "#e0e0e0", fontSize: "14px", fontWeight: "500" },
  statusDot: { color: "#4ade80", fontSize: "10px" },
  brandTag: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", background: "rgba(255,107,53,0.2)", backdropFilter: "blur(10px)", borderRadius: "20px", border: "1px solid rgba(255,107,53,0.3)" },
  brandIcon: { fontSize: "18px" },
  brandText: { color: "#fff", fontSize: "14px", fontWeight: "700", letterSpacing: "0.5px" },
  controls: { position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px", background: "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%)", display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", zIndex: 10 },
  controlButton: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "14px 20px", border: "none", borderRadius: "16px", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", fontFamily: "inherit", minWidth: "80px" },
  controlIcon: { fontSize: "24px" },
  controlText: { fontSize: "12px", fontWeight: "600", letterSpacing: "0.3px" },
  unreadBadge: { position: "absolute", top: "8px", right: "8px", width: "12px", height: "12px", background: "#ef4444", borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 2px 6px rgba(239,68,68,0.5)" },
  chatSidebar: { width: 380, height: "100%", background: "#fff", display: "flex", flexDirection: "column", borderLeft: "3px solid rgba(255,107,53,0.2)", boxShadow: "-4px 0 20px rgba(255,107,53,0.1)" },
  chatHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)" },
  chatTitle: { margin: 0, color: "#fff", fontSize: "18px", fontWeight: "700" },
  closeChatButton: { width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease" },
  chatList: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" },
  emptyChatState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" },
  emptyChatIcon: { fontSize: "48px", opacity: 0.3 },
  emptyChatText: { color: "#999", fontSize: "14px", margin: 0 },
  chatMessage: { display: "flex", marginBottom: "4px" },
  messageBubble: { maxWidth: "85%", padding: "12px 14px", borderRadius: "16px", wordWrap: "break-word", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  messageFrom: { fontSize: "11px", fontWeight: "600", opacity: 0.8, marginBottom: "4px" },
  messageText: { fontSize: "14px", lineHeight: "1.4" },
  messageTime: { fontSize: "10px", opacity: 0.7, marginTop: "4px", textAlign: "right" },
  fileLink: { display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", padding: "4px 0" },
  fileIcon: { fontSize: "18px" },
  chatInputBar: { display: "flex", alignItems: "center", gap: "8px", padding: "16px", background: "#fff5eb", borderTop: "2px solid rgba(255,107,53,0.2)" },
  attachButton: { width: "40px", height: "40px", borderRadius: "50%", background: "rgba(255,107,53,0.1)", border: "2px solid rgba(255,107,53,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", cursor: "pointer", transition: "all 0.2s ease" },
  chatInput: { flex: 1, padding: "12px 16px", background: "#fff", border: "2px solid rgba(255,107,53,0.2)", borderRadius: "20px", color: "#333", fontSize: "14px", outline: "none", fontFamily: "inherit" },
  sendBtn: { width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", border: "none", color: "#fff", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(255,107,53,0.4)", transition: "all 0.2s ease" },
};