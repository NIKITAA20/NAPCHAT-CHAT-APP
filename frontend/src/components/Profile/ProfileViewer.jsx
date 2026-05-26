import React, { useEffect, useState } from "react";
import API from "../../services/api";

/**
 * Read-only profile card — shown when you tap someone else's avatar
 * or pick "View profile" from their row menu. Lazily fetches the
 * latest copy from the server in case it changed since hydration.
 */
export default function ProfileViewer({ username, online, initial, onClose, onMessage, onBlock }) {
  const [profile, setProfile] = useState(initial || null);
  const [loading, setLoading] = useState(!initial?.avatar && !initial?.bio);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    API.get(`/users/profile/${username}`)
      .then((res) => { if (!cancelled) setProfile(res.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!username) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <style>{`
        /* Progressive enhancement: when the browser supports dvh, use it
           — that's the dynamic viewport height that excludes the mobile
           URL bar. Falls back to vh otherwise. */
        .profile-viewer-card { max-height: calc(100dvh - 32px); }
      `}</style>
      <div className="profile-viewer-card" style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.banner}>
          <button onClick={onClose} style={styles.close}>✕</button>
        </div>

        <div style={styles.avatarBlock}>
          <div style={styles.avatarRing}>
            {profile?.avatar ? (
              <img src={profile.avatar} alt={username} style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarFallback}>
                {username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div style={styles.body}>
          <div style={styles.nameRow}>
            <h3 style={styles.name}>{username}</h3>
            <span style={{ ...styles.statusPill, background: online ? "#e8f8ef" : "#f3f3f3", color: online ? "#16a34a" : "#888" }}>
              {online ? "● Online" : "○ Offline"}
            </span>
          </div>

          {loading ? (
            <div style={styles.bioPlaceholder}>Loading…</div>
          ) : profile?.bio ? (
            <p style={styles.bio}>{profile.bio}</p>
          ) : (
            <p style={styles.bioEmpty}>This user hasn't added a bio yet.</p>
          )}
        </div>

        {(onMessage || onBlock) && (
          <div style={styles.footer}>
            {onMessage && (
              <button style={styles.primaryBtn} onClick={() => { onMessage(); onClose?.(); }}>
                💬 Message
              </button>
            )}
            {onBlock && (
              <button style={styles.dangerBtn} onClick={() => { onBlock(); onClose?.(); }}>
                🚫 Block
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  // Overlay is itself scrollable as a fallback in case the viewport is
  // tiny — even if our maxHeight logic somehow fails, the user can still
  // reach every button by scrolling the dimmed backdrop.
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(4px)",
    zIndex: 9999,
    padding: 16,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    display: "flex",
    alignItems: "flex-start",        // top-align: avoids cropping on short screens
    justifyContent: "center",
    boxSizing: "border-box",
  },

  // The card itself has a hard ceiling so it never exceeds the viewport.
  // We also fall back through vh / dvh in case dvh isn't supported.
  card: {
    background: "#fff",
    borderRadius: 20,
    width: "100%",
    maxWidth: 380,
    margin: "auto 0",
    maxHeight: "calc(100vh - 32px)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxSizing: "border-box",
  },

  banner: { height: 70, flexShrink: 0, background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", position: "relative", zIndex: 0 },
  close: { position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", fontSize: 14, cursor: "pointer", zIndex: 2 },

  // z-index here pulls the avatar above the banner. Without it the
  // banner's stacking context (created by position:relative + its child
  // close-button's z-index) ends up obscuring the top half of the avatar.
  avatarBlock: { display: "flex", justifyContent: "center", marginTop: -42, flexShrink: 0, position: "relative", zIndex: 1 },
  avatarRing: { width: 88, height: 88, borderRadius: "50%", padding: 3, background: "linear-gradient(135deg, #ff6b35, #ff8c42)", boxShadow: "0 6px 16px rgba(0,0,0,0.15)", boxSizing: "border-box" },
  avatarImg: { width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", background: "#fff", display: "block" },
  avatarFallback: { width: "100%", height: "100%", borderRadius: "50%", background: "#fff", color: "#ff6b35", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 34 },

  body: { padding: "12px 20px 16px", textAlign: "center", overflowY: "auto", flex: "1 1 auto", minHeight: 0 },
  nameRow: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  name: { margin: 0, fontSize: 20, fontWeight: 800, color: "#222", wordBreak: "break-word" },
  statusPill: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12 },
  bio: { margin: "14px 0 4px", color: "#444", fontSize: 13.5, lineHeight: 1.5, padding: "10px 14px", background: "#fff5eb", borderRadius: 12, wordBreak: "break-word" },
  bioEmpty: { margin: "14px 0 4px", color: "#aaa", fontSize: 12, fontStyle: "italic" },
  bioPlaceholder: { margin: "14px 0 4px", color: "#ccc", fontSize: 12 },

  footer: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", padding: "12px 16px 14px", borderTop: "1px solid #f3f3f3", background: "#fff", flexShrink: 0 },
  primaryBtn: { padding: "9px 18px", border: "none", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", color: "#fff", borderRadius: 11, fontWeight: 700, fontSize: 13.5, cursor: "pointer", boxShadow: "0 4px 12px rgba(255,107,53,0.3)" },
  dangerBtn: { padding: "9px 18px", border: "1px solid #ffd5d2", background: "#fff5f0", color: "#c0392b", borderRadius: 11, fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
};
