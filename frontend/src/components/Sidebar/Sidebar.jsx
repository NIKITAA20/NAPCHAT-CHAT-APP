import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import socket from "../../services/socket";
import API from "../../services/api";
import ProfileModal from "../Profile/ProfileModal";
import ProfileViewer from "../Profile/ProfileViewer";
import CreateGroupModal from "../Group/CreateGroupModal";

export default function Sidebar({
  setSelectedUser,
  selectedUser,
  setSelectedGroup,
  selectedGroup,
}) {
  const me = localStorage.getItem("username");

  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [unread, setUnread] = useState({});
  const [typingFrom, setTypingFrom] = useState(null);
  const [search, setSearch] = useState("");

  const [profiles, setProfiles] = useState({});
  const myProfile = profiles[me] || {};

  const [blocked, setBlocked] = useState(new Set());

  // UI
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [showBlockedPanel, setShowBlockedPanel] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeGroupCalls, setActiveGroupCalls] = useState({}); // { groupId: [usernames] }

  /* ============== SOCKET WIRING ============== */
  useEffect(() => {
    if (!me) return;
    socket.emit("register_user", me);

    socket.on("users_list", setUsers);
    socket.on("users_status", setOnlineUsers);
    socket.on("typing", ({ from }) => {
      setTypingFrom(from);
      setTimeout(() => setTypingFrom(null), 1200);
    });

    return () => {
      socket.off("users_list");
      socket.off("users_status");
      socket.off("typing");
    };
  }, [me]);

  /* ============== INITIAL LOADS ============== */
  useEffect(() => {
    API.get("/users").then((res) => setUsers(res.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!me) return;
    API.get(`/chat/unread/${me}`).then((res) => setUnread(res.data)).catch(console.error);
    API.get(`/users/${me}/blocked`)
      .then((res) => setBlocked(new Set(res.data)))
      .catch(console.error);
  }, [me]);

  useEffect(() => {
    socket.on("unread_update", ({ from, count }) => {
      setUnread((prev) => ({ ...prev, [from]: count }));
    });
    return () => socket.off("unread_update");
  }, []);

  /* ============== GROUPS ============== */
  const refreshGroups = useCallback(() => {
    if (!me) return;
    API.get(`/groups/mine/${me}`)
      .then((res) => setGroups(res.data || []))
      .catch(console.error);
  }, [me]);

  useEffect(() => { refreshGroups(); }, [refreshGroups]);

  useEffect(() => {
    const onInvalidate = () => refreshGroups();
    const onLocalRefresh = () => refreshGroups();
    window.addEventListener("napchat:refresh-groups", onLocalRefresh);
    const onCallState = ({ groupId, participants }) => {
      setActiveGroupCalls((prev) => {
        const next = { ...prev };
        if (participants && participants.length) next[groupId] = participants;
        else delete next[groupId];
        return next;
      });
    };
    socket.on("group_invalidate", onInvalidate);
    socket.on("group_call_state", onCallState);
    return () => {
      socket.off("group_invalidate", onInvalidate);
      socket.off("group_call_state", onCallState);
      window.removeEventListener("napchat:refresh-groups", onLocalRefresh);
    };
  }, [refreshGroups]);

  /* ============== PROFILE HYDRATION ==============
     Whenever the visible user list changes, fetch profiles in one call
     so every avatar/bio is ready before we paint. */
  useEffect(() => {
    const usernames = [...new Set([me, ...users].filter(Boolean))];
    if (!usernames.length) return;
    API.get(`/users/profile/bulk`, { params: { usernames: usernames.join(",") } })
      .then((res) => setProfiles((p) => ({ ...p, ...res.data })))
      .catch(console.error);
  }, [users, me]);

  /* ============== HELPERS ============== */
  const openChat = useCallback(
    (user) => {
      setSelectedUser(user);
      localStorage.setItem("activeChat", user);
      setUnread((p) => ({ ...p, [user]: 0 }));
      socket.emit("clear_unread", { me, other: user });
      setMenuFor(null);
    },
    [me, setSelectedUser]
  );

  const handleBlock = async (target) => {
    setMenuFor(null);
    if (target === me) return;
    try {
      await API.post(`/users/${me}/block`, { target });
      const next = new Set(blocked);
      next.add(target);
      setBlocked(next);
      socket.emit("refresh_users_list");
      if (selectedUser === target) {
        setSelectedUser(null);
        localStorage.removeItem("activeChat");
      }
    } catch (err) {
      console.error("Block failed:", err);
    }
  };

  const handleUnblock = async (target) => {
    try {
      await API.delete(`/users/${me}/block/${target}`);
      const next = new Set(blocked);
      next.delete(target);
      setBlocked(next);
      socket.emit("refresh_users_list");
    } catch (err) {
      console.error("Unblock failed:", err);
    }
  };

  // Close any open row-menu on outside click
  useEffect(() => {
    if (!menuFor) return;
    const onDoc = () => setMenuFor(null);
    window.addEventListener("click", onDoc);
    return () => window.removeEventListener("click", onDoc);
  }, [menuFor]);

  const activeChat = localStorage.getItem("activeChat");

  const filteredUsers = useMemo(
    () =>
      users
        .filter((u) => u !== me)
        .filter((u) => !blocked.has(u))
        .filter((u) => u.toLowerCase().includes(search.toLowerCase())),
    [users, me, blocked, search]
  );

  /* ============== AVATAR HELPER ==============
     If we have a stored avatar URL/dataURL, render <img>; else
     fall back to a coloured initial. */
  const Avatar = ({ name, size = 48, ring = false, online = false, big = false }) => {
    const url = profiles[name]?.avatar;
    const initial = name?.charAt(0).toUpperCase() || "?";
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            padding: ring ? 3 : 0,
            background: ring
              ? "linear-gradient(135deg, #ff6b35, #ff8c42)"
              : "transparent",
            boxSizing: "border-box",
          }}
        >
          {url ? (
            <img
              src={url}
              alt={name}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                objectFit: "cover",
                background: "#fff",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background: big
                  ? "linear-gradient(135deg, #fff 0%, #ffe8d6 100%)"
                  : "linear-gradient(135deg, #ffb088 0%, #ffc7a8 100%)",
                color: big ? "#ff6b35" : "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: size * 0.4,
              }}
            >
              {initial}
            </div>
          )}
        </div>
        {online && <div style={styles.onlineDot} />}
      </div>
    );
  };

  return (
    <>
      <div className="sidebar-container" style={styles.sidebar}>
        {/* ============ MY PROFILE CARD ============ */}
        <div style={styles.meCard}>
          <button
            style={styles.meRow}
            onClick={() => setShowProfileModal(true)}
            aria-label="Edit my profile"
          >
            <Avatar name={me} size={56} ring big />
            <div style={styles.meInfo}>
              <div style={styles.meTopRow}>
                <span style={styles.meName}>{me}</span>
                <span style={styles.youBadge}>YOU</span>
              </div>
              <span style={styles.meSub}>
                {myProfile.bio
                  ? myProfile.bio
                  : "Tap to set up your profile"}
              </span>
            </div>
            <span style={styles.editIcon} aria-hidden>✎</span>
          </button>
        </div>

        {/* ============ SEARCH ============ */}
        <div style={styles.searchBox}>
          <div style={styles.searchWrapper}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              style={styles.searchInput}
            />
            {search && (
              <button style={styles.clearBtn} onClick={() => setSearch("")}>✕</button>
            )}
          </div>
        </div>

        {/* ============ GROUPS SECTION ============ */}
        <div style={styles.sectionHead}>
          <span style={styles.sectionTitle}>Groups</span>
          <button
            style={styles.newGroupBtn}
            onClick={() => setShowCreateGroup(true)}
            title="Create new group"
          >
            + New
          </button>
        </div>
        <div style={styles.groupList}>
          {groups.length === 0 && (
            <div style={styles.groupEmpty}>No groups yet. Tap “+ New” to start one.</div>
          )}
          {groups.map((g) => {
            const isActive = selectedGroup?.id === g.id;
            const live = activeGroupCalls[g.id]?.length > 0;
            return (
              <div
                key={g.id}
                onClick={() => setSelectedGroup?.(g)}
                style={{
                  ...styles.groupRow,
                  background: isActive ? "linear-gradient(135deg,#fff5f0 0%,#ffe8dc 100%)" : "transparent",
                  borderLeft: isActive ? "4px solid #ff6b35" : "4px solid transparent",
                }}
              >
                <div style={styles.groupAvatar}>
                  {g.avatar ? (
                    <img src={g.avatar} alt={g.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <span>👥</span>
                  )}
                  {live && <span style={styles.liveDot} title="Live call" />}
                </div>
                <div style={styles.userInfo}>
                  <div style={styles.nameRow}>
                    <span style={{ ...styles.name, color: isActive ? "#ff6b35" : "#333" }}>
                      {g.name}
                    </span>
                    {live && <span style={styles.liveBadge}>🎥 LIVE</span>}
                  </div>
                  <span style={styles.status}>
                    {g.members.length} member{g.members.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ============ USER LIST ============ */}
        <div style={styles.sectionHead}>
          <span style={styles.sectionTitle}>People</span>
        </div>
        <div style={styles.list}>
          {filteredUsers.map((u) => {
            const isOnline = !!onlineUsers[u];
            const isActive = activeChat === u;
            return (
              <div
                key={u}
                style={{
                  ...styles.user,
                  background: isActive
                    ? "linear-gradient(135deg, #fff5f0 0%, #ffe8dc 100%)"
                    : "transparent",
                  borderLeft: isActive ? "4px solid #ff6b35" : "4px solid transparent",
                }}
                onClick={() => openChat(u)}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "#fafafa";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  onClick={(e) => { e.stopPropagation(); setViewingUser(u); }}
                  title={`View ${u}'s profile`}
                  style={{ cursor: "pointer" }}
                >
                  <Avatar name={u} size={48} online={isOnline} />
                </div>

                <div style={styles.userInfo}>
                  <div style={styles.nameRow}>
                    <span style={{ ...styles.name, color: isActive ? "#ff6b35" : "#333" }}>
                      {u}
                    </span>
                    {unread[u] > 0 && <span style={styles.badge}>{unread[u]}</span>}
                  </div>

                  {typingFrom === u ? (
                    <div style={styles.typingWrapper}>
                      <span style={styles.typing}>typing</span>
                      <span style={styles.dots}>
                        <span style={styles.dot}>.</span>
                        <span style={styles.dot}>.</span>
                        <span style={styles.dot}>.</span>
                      </span>
                    </div>
                  ) : (
                    <span style={{ ...styles.status, color: isOnline ? "#22c55e" : "#999" }}>
                      {isOnline ? "● Online" : "○ Offline"}
                    </span>
                  )}
                </div>

                {/* 3-dot menu (block / etc.) */}
                <div
                  style={styles.menuWrap}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor(menuFor === u ? null : u);
                  }}
                >
                  <button style={styles.menuBtn} aria-label={`Options for ${u}`}>⋮</button>
                  {menuFor === u && (
                    <div style={styles.menuPopover} onClick={(e) => e.stopPropagation()}>
                      <button
                        style={styles.menuItem}
                        onClick={() => { setMenuFor(null); setViewingUser(u); }}
                      >
                        👤 View profile
                      </button>
                      <button
                        style={styles.menuItemDanger}
                        onClick={() => handleBlock(u)}
                      >
                        🚫 Block {u}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>👥</div>
              <p style={styles.emptyText}>
                {search ? "No matches" : "No people yet"}
              </p>
              <p style={styles.emptySubtext}>
                {search ? "Try a different search" : "Others will appear here when they sign in"}
              </p>
            </div>
          )}
        </div>

        {/* ============ FOOTER ============ */}
        <div style={styles.footer}>
          <button
            style={styles.blockedToggle}
            onClick={() => setShowBlockedPanel((v) => !v)}
          >
            <span>🚫 Blocked</span>
            <span style={styles.blockedCount}>{blocked.size}</span>
          </button>
        </div>

        {/* ============ BLOCKED PANEL ============ */}
        {showBlockedPanel && (
          <div style={styles.blockedPanel}>
            <div style={styles.blockedHeader}>
              <span>Blocked users</span>
              <button style={styles.closeBlocked} onClick={() => setShowBlockedPanel(false)}>✕</button>
            </div>
            {blocked.size === 0 ? (
              <div style={styles.blockedEmpty}>No one blocked. ✨</div>
            ) : (
              [...blocked].map((u) => (
                <div key={u} style={styles.blockedRow}>
                  <Avatar name={u} size={36} />
                  <span style={styles.blockedName}>{u}</span>
                  <button style={styles.unblockBtn} onClick={() => handleUnblock(u)}>
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showProfileModal && (
        <ProfileModal
          me={me}
          profile={myProfile}
          onClose={() => setShowProfileModal(false)}
          onSaved={(updated) => {
            setProfiles((p) => ({ ...p, [me]: updated }));
          }}
        />
      )}

      {viewingUser && (
        <ProfileViewer
          username={viewingUser}
          online={!!onlineUsers[viewingUser]}
          initial={profiles[viewingUser]}
          onClose={() => setViewingUser(null)}
          onMessage={() => openChat(viewingUser)}
          onBlock={() => handleBlock(viewingUser)}
        />
      )}

      {showCreateGroup && (
        <CreateGroupModal
          me={me}
          candidates={users.filter((u) => u !== me && !blocked.has(u))}
          onClose={() => setShowCreateGroup(false)}
          onCreated={(g) => {
            setGroups((prev) => [g, ...prev]);
            setSelectedGroup?.(g);
          }}
        />
      )}

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
        .sidebar-container {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </>
  );
}

/* ================= STYLES ================= */
const styles = {
  sidebar: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#ffffff",
    position: "relative",
    boxShadow: "2px 0 10px rgba(0,0,0,0.03)",
    minHeight: 0,
  },
  /* === MY PROFILE CARD === */
  meCard: {
    padding: "18px 14px 16px",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    boxShadow: "0 2px 12px rgba(255,107,53,0.25)",
    flexShrink: 0,
  },
  meRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: 8,
    borderRadius: 16,
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.25)",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left",
    transition: "background 0.2s ease",
  },
  meInfo: { flex: 1, minWidth: 0 },
  meTopRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 2 },
  meName: {
    fontWeight: 800,
    fontSize: 17,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  youBadge: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1,
    padding: "2px 7px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.9)",
    color: "#ff6b35",
    flexShrink: 0,
  },
  meSub: {
    display: "block",
    fontSize: 12,
    opacity: 0.85,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  editIcon: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
  },

  /* === SEARCH === */
  searchBox: { padding: "14px 14px 10px", background: "#fff", flexShrink: 0 },
  searchWrapper: { position: "relative", display: "flex", alignItems: "center" },
  searchIcon: { position: "absolute", left: 14, fontSize: 14, opacity: 0.5 },
  searchInput: {
    width: "100%",
    padding: "11px 40px 11px 38px",
    borderRadius: 22,
    border: "2px solid #f3f3f3",
    outline: "none",
    fontSize: 14,
    background: "#fafafa",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  clearBtn: {
    position: "absolute",
    right: 10,
    background: "#ff6b35",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: 20,
    height: 20,
    fontSize: 11,
    cursor: "pointer",
  },

  /* === USER LIST === */
  list: { flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 },
  user: {
    display: "flex",
    gap: 12,
    padding: "12px 14px",
    cursor: "pointer",
    alignItems: "center",
    transition: "all 0.2s ease",
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#22c55e",
    border: "2px solid #fff",
    boxShadow: "0 0 0 2px rgba(34,197,94,0.2)",
  },
  userInfo: { flex: 1, minWidth: 0 },
  nameRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2, gap: 8 },
  name: {
    fontWeight: 600,
    fontSize: 15,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    background: "linear-gradient(135deg, #ff6b35 0%, #ff5722 100%)",
    color: "#fff",
    borderRadius: 12,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 700,
    minWidth: 20,
    textAlign: "center",
  },
  status: { fontSize: 12, fontWeight: 500 },
  typingWrapper: { display: "flex", alignItems: "center", gap: 2 },
  typing: { fontSize: 12, color: "#ff6b35", fontWeight: 600 },
  dots: { display: "inline-flex", gap: 2 },
  dot: { animation: "bounce 1.4s infinite ease-in-out", display: "inline-block", color: "#ff6b35", fontSize: 16 },

  /* === ROW MENU === */
  menuWrap: { position: "relative", flexShrink: 0 },
  menuBtn: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "transparent",
    border: "none",
    color: "#888",
    fontSize: 20,
    cursor: "pointer",
  },
  menuPopover: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 4px)",
    background: "#fff",
    borderRadius: 12,
    padding: 6,
    boxShadow: "0 8px 28px rgba(0,0,0,0.15)",
    border: "1px solid #f0f0f0",
    zIndex: 50,
    minWidth: 160,
  },
  menuItem: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    color: "#333",
    fontWeight: 600,
    fontSize: 13,
    textAlign: "left",
    borderRadius: 8,
    cursor: "pointer",
  },
  menuItemDanger: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    color: "#c0392b",
    fontWeight: 600,
    fontSize: 13,
    textAlign: "left",
    borderRadius: 8,
    cursor: "pointer",
  },

  /* === EMPTY === */
  emptyState: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 44, marginBottom: 12, opacity: 0.4 },
  emptyText: { color: "#666", fontWeight: 600, fontSize: 15, margin: "0 0 6px" },
  emptySubtext: { color: "#999", fontSize: 12, margin: 0 },

  /* === FOOTER === */
  footer: {
    padding: 12,
    borderTop: "1px solid #f0f0f0",
    background: "#fafafa",
    flexShrink: 0,
  },
  blockedToggle: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#555",
  },
  blockedCount: {
    background: "#ffe8d6",
    color: "#ff6b35",
    borderRadius: 10,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 700,
    minWidth: 22,
    textAlign: "center",
  },

  /* === BLOCKED PANEL (slides over the list) === */
  blockedPanel: {
    position: "absolute",
    inset: 0,
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    zIndex: 10,
  },
  blockedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 18px",
    fontSize: 15,
    fontWeight: 700,
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    color: "#fff",
  },
  closeBlocked: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.22)",
    border: "none",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
  },
  blockedEmpty: { padding: "40px 20px", color: "#999", textAlign: "center", fontSize: 14 },
  blockedRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderBottom: "1px solid #f5f5f5",
  },
  blockedName: { flex: 1, fontWeight: 600, color: "#333", fontSize: 14 },
  unblockBtn: {
    padding: "6px 12px",
    border: "1px solid #ff6b35",
    background: "#fff",
    color: "#ff6b35",
    fontWeight: 600,
    borderRadius: 18,
    fontSize: 12,
    cursor: "pointer",
  },

  /* === GROUPS SECTION === */
  sectionHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px 6px",
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
    color: "#999",
    textTransform: "uppercase",
  },
  newGroupBtn: {
    padding: "5px 12px",
    border: "1.5px solid #ff6b35",
    background: "#fff",
    color: "#ff6b35",
    borderRadius: 14,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  groupList: {
    flexShrink: 0,
    maxHeight: "30dvh",
    overflowY: "auto",
    borderBottom: "1px solid #f5f5f5",
    paddingBottom: 6,
  },
  groupEmpty: {
    padding: "10px 18px 14px",
    color: "#aaa",
    fontSize: 12,
    fontStyle: "italic",
  },
  groupRow: {
    display: "flex",
    gap: 12,
    padding: "10px 14px",
    cursor: "pointer",
    alignItems: "center",
    transition: "background 0.2s ease",
  },
  groupAvatar: {
    position: "relative",
    width: 44,
    height: 44,
    borderRadius: 14,
    background: "linear-gradient(135deg, #ffb088 0%, #ff6b35 100%)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    flexShrink: 0,
    overflow: "hidden",
  },
  liveDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    background: "#22c55e",
    borderRadius: "50%",
    border: "2px solid #fff",
    boxShadow: "0 0 0 2px rgba(34,197,94,0.3)",
  },
  liveBadge: {
    background: "#22c55e",
    color: "#fff",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.5,
    padding: "2px 6px",
    borderRadius: 8,
  },
};
