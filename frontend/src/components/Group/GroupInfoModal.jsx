import React, { useEffect, useMemo, useState } from "react";
import API from "../../services/api";
import socket from "../../services/socket";

export default function GroupInfoModal({ me, group, memberProfiles, onClose, onGroupUpdated, onLeft }) {
  const [adding, setAdding] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!adding) return;
    API.get("/users")
      .then((res) => setAllUsers(res.data || []))
      .catch(console.error);
  }, [adding]);

  const candidates = useMemo(() => {
    const memberSet = new Set(group.members);
    return allUsers
      .filter((u) => !memberSet.has(u) && u !== me)
      .filter((u) => u.toLowerCase().includes(search.toLowerCase()));
  }, [allUsers, group.members, me, search]);

  const addMember = async (username) => {
    setBusy(true);
    try {
      const { data } = await API.post(`/groups/${group.id}/members`, {
        username,
        addedBy: me,
      });
      onGroupUpdated?.(data);
      socket.emit("group_invalidate", { groupId: group.id });
    } catch (err) {
      console.error("Add member failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const removeSelf = async () => {
    if (!confirm(`Leave "${group.name}"?`)) return;
    setBusy(true);
    try {
      await API.delete(`/groups/${group.id}/members/${me}`);
      socket.emit("group_invalidate", { groupId: group.id });
      // Backend's invalidate broadcast iterates current members, which
      // no longer includes us — so we have to refresh our own sidebar
      // locally. Custom event keeps the wiring decoupled.
      window.dispatchEvent(new CustomEvent("napchat:refresh-groups"));
      onLeft?.();   // let parent ChatBox dismiss the now-closed chat
      onClose?.();
    } catch (err) {
      console.error("Leave failed:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>{group.name}</h3>
          <button onClick={onClose} style={styles.close}>✕</button>
        </div>

        <div style={styles.body}>
          {!adding ? (
            <>
              <div style={styles.sub}>
                {group.members.length} member{group.members.length === 1 ? "" : "s"}
                {group.owner === me && <span style={styles.ownerPill}>OWNER</span>}
              </div>

              <div style={styles.memberList}>
                {group.members.map((u) => {
                  const profile = memberProfiles?.[u] || {};
                  return (
                    <div key={u} style={styles.memberRow}>
                      <div style={styles.memberAvatar}>
                        {profile.avatar ? (
                          <img src={profile.avatar} alt={u} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                        ) : (
                          u.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.memberName}>
                          {u} {u === me && <span style={styles.youPill}>YOU</span>}
                        </div>
                        {profile.bio && <div style={styles.memberBio}>{profile.bio}</div>}
                      </div>
                      {u === group.owner && <span style={styles.crown}>👑</span>}
                    </div>
                  );
                })}
              </div>

              <button style={styles.primaryBtn} onClick={() => setAdding(true)}>
                ＋ Add members
              </button>
              <button style={styles.dangerBtn} onClick={removeSelf} disabled={busy}>
                🚪 Leave group
              </button>
            </>
          ) : (
            <>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people…"
                style={styles.input}
              />
              <div style={styles.memberList}>
                {candidates.length === 0 ? (
                  <div style={styles.empty}>No one left to add.</div>
                ) : (
                  candidates.map((u) => (
                    <div key={u} style={styles.memberRow}>
                      <div style={styles.memberAvatar}>{u.charAt(0).toUpperCase()}</div>
                      <div style={styles.memberName}>{u}</div>
                      <button
                        style={styles.addBtn}
                        onClick={() => addMember(u)}
                        disabled={busy}
                      >
                        + Add
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button style={styles.secondaryBtn} onClick={() => setAdding(false)}>
                ← Back
              </button>
            </>
          )}
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
  body: { padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 },
  sub: { fontSize: 13, color: "#666", display: "flex", alignItems: "center", gap: 8 },
  ownerPill: { fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: "#fff5eb", color: "#ff6b35" },
  memberList: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" },
  memberRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1.5px solid #f3f3f3", borderRadius: 12 },
  memberAvatar: { width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #ffb088 0%, #ffc7a8 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, overflow: "hidden", flexShrink: 0 },
  memberName: { fontWeight: 600, color: "#333", fontSize: 14, display: "flex", alignItems: "center", gap: 6 },
  memberBio: { fontSize: 12, color: "#999", marginTop: 2 },
  youPill: { fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6, background: "#ff6b35", color: "#fff" },
  crown: { fontSize: 16 },
  primaryBtn: { padding: "12px", border: "none", background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)", color: "#fff", borderRadius: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(255,107,53,0.35)" },
  secondaryBtn: { padding: "10px 18px", border: "2px solid #f0f0f0", background: "#fff", color: "#666", borderRadius: 12, fontWeight: 600, cursor: "pointer" },
  dangerBtn: { padding: "10px", border: "1px solid #ffd5d2", background: "#fff5f0", color: "#c0392b", borderRadius: 12, fontWeight: 700, cursor: "pointer" },
  addBtn: { padding: "6px 12px", border: "1.5px solid #ff6b35", background: "#fff", color: "#ff6b35", fontWeight: 700, borderRadius: 14, fontSize: 12, cursor: "pointer" },
  input: { width: "100%", padding: "12px 14px", border: "2px solid #ffe4d6", borderRadius: 12, fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  empty: { padding: 20, color: "#aaa", fontSize: 13, textAlign: "center" },
};
