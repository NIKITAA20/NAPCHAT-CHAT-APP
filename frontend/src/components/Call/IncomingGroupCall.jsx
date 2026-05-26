import React, { useEffect, useRef } from "react";
import socket from "../../services/socket";
import ringtone from "../../assets/ringtone.mp3";

/**
 * Full-screen ringing UI for an incoming GROUP video call.
 * Triggered by the server's `group_call_invitation` event when the
 * first member joins a call. Auto-dismisses if the call ends before
 * anyone picks up (server fires `group_call_invitation_cancelled`).
 */
export default function IncomingGroupCall({ groupId, groupName, initiator, onAccept, onReject }) {
  const ringtoneRef = useRef(null);

  useEffect(() => {
    const audio = new Audio(ringtone);
    audio.loop = true;
    ringtoneRef.current = audio;

    audio.addEventListener(
      "canplaythrough",
      () => { audio.play().catch(() => {}); },
      { once: true }
    );

    // If the call ended before pick-up, the server cancels the invitation.
    const onCancel = ({ groupId: gid }) => {
      if (gid === groupId) handleReject();
    };
    socket.on("group_call_invitation_cancelled", onCancel);

    return () => {
      stopRingtone();
      socket.off("group_call_invitation_cancelled", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  };

  const handleAccept = () => { stopRingtone(); onAccept?.(); };
  const handleReject = () => { stopRingtone(); onReject?.(); };

  return (
    <>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes ripple { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
        .incoming-gcall-container { animation: slideUp 0.4s ease-out; }
        .gcall-icon { animation: pulse 2s ease-in-out infinite; }
        .gcall-ripple { position: absolute; border-radius: 50%; border: 3px solid #ff6b35; animation: ripple 2s ease-out infinite; }
        .gcall-accept:hover { transform: scale(1.05); box-shadow: 0 8px 24px rgba(34,197,94,0.4); }
        .gcall-reject:hover { transform: scale(1.05); box-shadow: 0 8px 24px rgba(239,68,68,0.4); }
      `}</style>

      <div style={styles.overlay}>
        <div className="incoming-gcall-container" style={styles.container}>
          <div style={styles.iconContainer}>
            <div className="gcall-ripple" style={styles.ripple} />
            <div className="gcall-ripple" style={{ ...styles.ripple, animationDelay: "1s" }} />
            <div className="gcall-icon" style={styles.callIcon}>🎥</div>
          </div>

          <div style={styles.info}>
            <h2 style={styles.title}>Incoming Group Call</h2>
            <p style={styles.groupName}>{groupName || "Group"}</p>
            <p style={styles.initiator}>
              <strong>{initiator}</strong> started a call
            </p>
          </div>

          <div style={styles.buttonContainer}>
            <button onClick={handleReject} className="gcall-reject" style={styles.rejectBtn}>
              <span style={styles.bigIcon}>✕</span>
              <span style={styles.btnText}>Decline</span>
            </button>
            <button onClick={handleAccept} className="gcall-accept" style={styles.acceptBtn}>
              <span style={styles.bigIcon}>✓</span>
              <span style={styles.btnText}>Join</span>
            </button>
          </div>

          <div style={styles.hint}>
            <span style={styles.hintDot}>●</span>
            <span style={styles.hintText}>NAPCHAT Group Video Call</span>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "linear-gradient(135deg, rgba(0,0,0,0.92) 0%, rgba(26,26,26,0.95) 100%)", backdropFilter: "blur(10px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  container: { display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 420, width: "100%", padding: "40px 30px", background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)", borderRadius: 32, boxShadow: "0 20px 60px rgba(255,107,53,0.3)", border: "2px solid rgba(255,107,53,0.2)" },
  iconContainer: { position: "relative", width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" },
  ripple: { width: 120, height: 120, top: 0, left: 0 },
  callIcon: { fontSize: 56, background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", width: 120, height: 120, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px rgba(255,107,53,0.4)", position: "relative", zIndex: 1 },
  info: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" },
  title: { margin: 0, color: "#fff", fontSize: 18, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", opacity: 0.85 },
  groupName: { margin: 0, color: "#fff", fontSize: 26, fontWeight: 700, letterSpacing: "0.5px" },
  initiator: { margin: 0, color: "#9ca3af", fontSize: 14 },
  buttonContainer: { display: "flex", gap: 20, width: "100%", justifyContent: "center", flexWrap: "wrap" },
  acceptBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 32px", background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)", border: "none", borderRadius: 20, cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 4px 16px rgba(34,197,94,0.3)", minWidth: 140 },
  rejectBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 32px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", border: "none", borderRadius: 20, cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 4px 16px rgba(239,68,68,0.3)", minWidth: 140 },
  bigIcon: { fontSize: 32, color: "#fff", fontWeight: 700 },
  btnText: { fontSize: 15, fontWeight: 600, color: "#fff", letterSpacing: "0.5px" },
  hint: { display: "flex", alignItems: "center", gap: 8 },
  hintDot: { color: "#ff6b35", fontSize: 8 },
  hintText: { color: "#6b7280", fontSize: 12, fontWeight: 500, letterSpacing: "0.5px" },
};
