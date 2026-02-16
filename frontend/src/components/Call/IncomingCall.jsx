import React, { useEffect, useRef } from "react";
import socket from "../../services/socket";

export default function IncomingCall({ from, onAccept, onReject }) {
  const ringtoneRef = useRef(null);

  useEffect(() => {
    ringtoneRef.current = new Audio("/ringtone.mp3");
    ringtoneRef.current.loop = true;
    ringtoneRef.current.play().catch(() => {});

    // ✅ If caller cancels while ringing, auto-dismiss
    socket.on("call-ended", handleReject);

    return () => {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
      socket.off("call-ended", handleReject);
    };
  }, []);

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  };

  const handleAccept = () => {
    stopRingtone();
    onAccept(); // ✅ parent unmounts this, mounts CallOverlay with incoming=true
  };

  const handleReject = () => {
    stopRingtone();
    onReject();
  };

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes ripple {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        .incoming-call-container { animation: slideUp 0.4s ease-out; }
        .call-icon { animation: pulse 2s ease-in-out infinite; }
        .ripple-effect {
          position: absolute;
          border-radius: 50%;
          border: 3px solid #ff6b35;
          animation: ripple 2s ease-out infinite;
        }
        .accept-button:hover { transform: scale(1.05); box-shadow: 0 8px 24px rgba(34, 197, 94, 0.4); }
        .reject-button:hover { transform: scale(1.05); box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4); }
        .accept-button:active, .reject-button:active { transform: scale(0.95); }
      `}</style>

      <div style={styles.overlay}>
        <div className="incoming-call-container" style={styles.container}>
          {/* Call Icon with Ripple */}
          <div style={styles.iconContainer}>
            <div className="ripple-effect" style={styles.ripple1} />
            <div className="ripple-effect" style={{ ...styles.ripple2, animationDelay: "1s" }} />
            <div className="call-icon" style={styles.callIcon}>📞</div>
          </div>

          {/* Caller Info */}
          <div style={styles.callerInfo}>
            <h2 style={styles.title}>Incoming Call</h2>
            <div style={styles.callerAvatar}>{from?.charAt(0).toUpperCase()}</div>
            <p style={styles.callerName}>{from}</p>
            <p style={styles.callingText}>is calling you...</p>
          </div>

          {/* Buttons */}
          <div style={styles.buttonContainer}>
            <button onClick={handleReject} className="reject-button" style={styles.rejectButton}>
              <span style={styles.buttonIcon}>✕</span>
              <span style={styles.buttonText}>Decline</span>
            </button>
            <button onClick={handleAccept} className="accept-button" style={styles.acceptButton}>
              <span style={styles.buttonIcon}>✓</span>
              <span style={styles.buttonText}>Accept</span>
            </button>
          </div>

          <div style={styles.hint}>
            <span style={styles.hintDot}>●</span>
            <span style={styles.hintText}>NAPCHAT Voice Call</span>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0,
    background: "linear-gradient(135deg, rgba(0,0,0,0.92) 0%, rgba(26,26,26,0.95) 100%)",
    backdropFilter: "blur(10px)", zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
  },
  container: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "32px",
    maxWidth: "420px", width: "100%", padding: "40px 30px",
    background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
    borderRadius: "32px", boxShadow: "0 20px 60px rgba(255,107,53,0.3)",
    border: "2px solid rgba(255,107,53,0.2)",
  },
  iconContainer: { position: "relative", width: "120px", height: "120px", display: "flex", alignItems: "center", justifyContent: "center" },
  ripple1: { width: "120px", height: "120px", top: 0, left: 0 },
  ripple2: { width: "120px", height: "120px", top: 0, left: 0 },
  callIcon: { fontSize: "64px", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", width: "120px", height: "120px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px rgba(255,107,53,0.4)", position: "relative", zIndex: 1 },
  callerInfo: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center" },
  title: { margin: 0, color: "#fff", fontSize: "20px", fontWeight: "600", letterSpacing: "0.5px", textTransform: "uppercase", opacity: 0.8 },
  callerAvatar: { width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "36px", fontWeight: "700", boxShadow: "0 4px 16px rgba(255,107,53,0.3)", border: "4px solid rgba(255,255,255,0.1)" },
  callerName: { margin: 0, color: "#fff", fontSize: "28px", fontWeight: "700", letterSpacing: "0.5px" },
  callingText: { margin: 0, color: "#9ca3af", fontSize: "15px", fontWeight: "400" },
  buttonContainer: { display: "flex", gap: "20px", width: "100%", justifyContent: "center", flexWrap: "wrap" },
  acceptButton: { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "20px 32px", background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)", border: "none", borderRadius: "20px", cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 4px 16px rgba(34,197,94,0.3)", minWidth: "140px" },
  rejectButton: { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "20px 32px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", border: "none", borderRadius: "20px", cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 4px 16px rgba(239,68,68,0.3)", minWidth: "140px" },
  buttonIcon: { fontSize: "32px", color: "#fff", fontWeight: "700" },
  buttonText: { fontSize: "15px", fontWeight: "600", color: "#fff", letterSpacing: "0.5px" },
  hint: { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" },
  hintDot: { color: "#ff6b35", fontSize: "8px" },
  hintText: { color: "#6b7280", fontSize: "13px", fontWeight: "500", letterSpacing: "0.5px" },
};