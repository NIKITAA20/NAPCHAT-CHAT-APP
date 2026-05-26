import React, { useEffect, useMemo, useState } from "react";
import API from "../../services/api";
import socket from "../../services/socket";

/**
 * Two-step modal:
 *   1. Pick a name
 *   2. Pick members from the existing users list
 */
export default function CreateGroupModal({ me, candidates = [], onClose, onCreated }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(
    () =>
      candidates
        .filter((u) => u !== me)
        .filter((u) => u.toLowerCase().includes(search.toLowerCase())),
    [candidates, me, search]
  );

  const toggle = (u) => {
    const next = new Set(selected);
    next.has(u) ? next.delete(u) : next.add(u);
    setSelected(next);
  };

  const submit = async () => {
    if (!name.trim()) return setError("Give your group a name.");
    if (selected.size < 1) return setError("Pick at least one member.");

    setBusy(true);
    setError("");
    try {
      const { data } = await API.post(`/groups`, {
        name: name.trim(),
        owner: me,
        members: [...selected],
      });
      socket.emit("group_invalidate", { groupId: data.id });
      onCreated?.(data);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not create group.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>New Group</h3>
          <button onClick={onClose} style={styles.close}>✕</button>
        </div>

        <div style={styles.body}>
          <label style={styles.label}>Group name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project Alpha"
            maxLength={60}
            style={styles.input}
          />

          <label style={{ ...styles.label, marginTop: 14 }}>Add members</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            style={styles.input}
          />

          <div style={styles.memberList}>
            {filtered.length === 0 && (
              <div style={styles.emptyMembers}>No one to add.</div>
            )}
            {filtered.map((u) => {
              const active = selected.has(u);
              return (
                <button
                  key={u}
                  onClick={() => toggle(u)}
                  style={{
                    ...styles.memberRow,
                    background: active ? "rgba(255,107,53,0.12)" : "transparent",
                    borderColor: active ? "#ff8c42" : "#f0f0f0",
                  }}
                >
                  <div style={styles.memberAvatar}>{u.charAt(0).toUpperCase()}</div>
                  <span style={styles.memberName}>{u}</span>
                  <span style={{ ...styles.check, color: active ? "#ff6b35" : "#ccc" }}>
                    {active ? "●" : "○"}
                  </span>
                </button>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div style={styles.selectedRow}>
              <span style={styles.selectedLabel}>{selected.size} selected</span>
              <button style={styles.clearLink} onClick={() => setSelected(new Set())}>
                clear
              </button>
            </div>
          )}

          {error && <div style={styles.error}>{error}</div>}
        </div>

        <div style={styles.footer}>
          <button style={styles.secondaryBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button style={styles.primaryBtn} onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { background: "#fff", borderRadius: 22, width: "100%", maxWidth: 460, maxHeight: "90dvh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", color: "#fff" },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  close: { width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.22)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer" },
  body: { padding: 20, overflowY: "auto", flex: 1 },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#666", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { width: "100%", padding: "12px 14px", border: "2px solid #ffe4d6", borderRadius: 12, fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  memberList: { marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", paddingRight: 4 },
  memberRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "2px solid #f0f0f0", borderRadius: 12, cursor: "pointer", fontSize: 14, textAlign: "left" },
  memberAvatar: { width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #ffb088 0%, #ffc7a8 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  memberName: { flex: 1, fontWeight: 600, color: "#333" },
  check: { fontSize: 16 },
  emptyMembers: { padding: 24, textAlign: "center", color: "#999", fontSize: 13 },
  selectedRow: { marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#fff5eb", borderRadius: 10 },
  selectedLabel: { fontSize: 12, fontWeight: 700, color: "#ff6b35" },
  clearLink: { background: "transparent", border: "none", color: "#888", fontSize: 12, cursor: "pointer", textDecoration: "underline" },
  error: { marginTop: 12, padding: "10px 12px", background: "#fff0ef", color: "#c0392b", border: "1px solid #ffd5d2", borderRadius: 10, fontSize: 13 },
  footer: { display: "flex", gap: 10, padding: "14px 20px", borderTop: "1px solid #f0f0f0", justifyContent: "flex-end" },
  secondaryBtn: { padding: "10px 18px", border: "2px solid #f0f0f0", background: "#fff", color: "#666", borderRadius: 12, fontWeight: 600, cursor: "pointer" },
  primaryBtn: { padding: "10px 22px", border: "none", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", color: "#fff", borderRadius: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(255,107,53,0.35)" },
};
