import React, { useEffect, useRef, useState } from "react";
import API from "../../services/api";

/**
 * Resize a File into a small square JPEG data URL (200x200, ~80% quality).
 * Keeps the payload around ~10-30KB — fine for Redis storage.
 */
const resizeAvatar = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 200;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");

        // Cover-crop: keep aspect, fill the square.
        const ratio = Math.max(SIZE / img.width, SIZE / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (SIZE - w) / 2;
        const y = (SIZE - h) / 2;
        ctx.drawImage(img, x, y, w, h);

        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function ProfileModal({ me, profile, onClose, onSaved }) {
  const [preview, setPreview] = useState(profile?.avatar || null);
  const [bio, setBio] = useState(profile?.bio || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  // Close on Escape — nice keyboard UX
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file.");
      return;
    }
    setError("");
    try {
      const dataUrl = await resizeAvatar(file);
      setPreview(dataUrl);
    } catch {
      setError("Could not read that image.");
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await API.put(`/users/profile/${me}`, {
        avatar: preview || "",
        bio,
      });
      onSaved?.(data);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const removeAvatar = () => setPreview(null);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.card}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Edit profile"
      >
        <div style={styles.header}>
          <h3 style={styles.title}>My Profile</h3>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={styles.body}>
          {/* Avatar */}
          <div style={styles.avatarBlock}>
            <div style={styles.avatarRing}>
              {preview ? (
                <img src={preview} alt="avatar" style={styles.avatarImg} />
              ) : (
                <div style={styles.avatarFallback}>
                  {me?.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>
            <div style={styles.avatarActions}>
              <button
                style={styles.primaryGhost}
                onClick={() => fileRef.current?.click()}
              >
                {preview ? "Change photo" : "Upload photo"}
              </button>
              {preview && (
                <button style={styles.dangerGhost} onClick={removeAvatar}>
                  Remove
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>

          {/* Username (read-only — identity) */}
          <label style={styles.label}>Username</label>
          <input style={styles.inputReadOnly} value={me} readOnly />

          {/* Bio */}
          <label style={styles.label}>Bio</label>
          <textarea
            style={styles.textarea}
            placeholder="Say something about yourself…"
            value={bio}
            maxLength={200}
            onChange={(e) => setBio(e.target.value)}
          />
          <div style={styles.bioCount}>{bio.length}/200</div>

          {error && <div style={styles.error}>{error}</div>}
        </div>

        <div style={styles.footer}>
          <button style={styles.secondaryBtn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={styles.primaryBtn} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(4px)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 22,
    width: "100%",
    maxWidth: 420,
    maxHeight: "90dvh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    color: "#fff",
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.22)",
    border: "none",
    color: "#fff",
    fontSize: 16,
    cursor: "pointer",
  },
  body: { padding: "20px", overflowY: "auto", flex: 1 },
  avatarBlock: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 18,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: "50%",
    padding: 4,
    background: "linear-gradient(135deg, #ff6b35, #ff8c42)",
    flexShrink: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#fff",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    background: "#fff",
    color: "#ff6b35",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 36,
  },
  avatarActions: { display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  primaryGhost: {
    padding: "10px 14px",
    border: "2px solid #ff6b35",
    background: "#fff",
    color: "#ff6b35",
    borderRadius: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  dangerGhost: {
    padding: "8px 12px",
    border: "1px solid #ffd5c5",
    background: "#fff5f0",
    color: "#c0392b",
    borderRadius: 10,
    fontWeight: 500,
    cursor: "pointer",
    fontSize: 13,
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "#666",
    margin: "8px 0 6px",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputReadOnly: {
    width: "100%",
    padding: "12px 14px",
    border: "2px solid #f0f0f0",
    background: "#f9f9f9",
    color: "#333",
    borderRadius: 12,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "12px 14px",
    border: "2px solid #ffe4d6",
    borderRadius: 12,
    minHeight: 80,
    fontSize: 14,
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  bioCount: { textAlign: "right", fontSize: 11, color: "#999", marginTop: 4 },
  error: {
    marginTop: 12,
    padding: "10px 12px",
    background: "#fff0ef",
    color: "#c0392b",
    border: "1px solid #ffd5d2",
    borderRadius: 10,
    fontSize: 13,
  },
  footer: {
    display: "flex",
    gap: 10,
    padding: "14px 20px",
    borderTop: "1px solid #f0f0f0",
    justifyContent: "flex-end",
  },
  secondaryBtn: {
    padding: "10px 18px",
    border: "2px solid #f0f0f0",
    background: "#fff",
    color: "#666",
    borderRadius: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  primaryBtn: {
    padding: "10px 22px",
    border: "none",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    color: "#fff",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(255,107,53,0.35)",
  },
};
