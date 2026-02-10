import React, { useEffect, useState } from "react";
import socket from "../../services/socket";
import API from "../../services/api";

export default function Sidebar({ setSelectedUser, selectedUser }) {
  const me = localStorage.getItem("username");

  const [users, setUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [unread, setUnread] = useState({});
  const [typingFrom, setTypingFrom] = useState(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

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

useEffect(() => {
  API.get("/users")
    .then(res => setUsers(res.data))
    .catch(console.error);
}, []);


useEffect(() => {
  if (!me) return;

  API.get(`/chat/unread/${me}`)
    .then(res => setUnread(res.data))
    .catch(console.error);
}, [me]);

  const openChat = (user) => {
    setSelectedUser(user);
    localStorage.setItem("activeChat", user);

    setUnread((p) => ({ ...p, [user]: 0 }));

    socket.emit("clear_unread", { me, other: user });
    setIsMobileOpen(false);
  };

  const activeChat = localStorage.getItem("activeChat");

  const filteredUsers = users
    .filter((u) => u !== me)
    .filter((u) => u.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {/* MOBILE TOGGLE - Only show if no chat selected on mobile */}
      {!selectedUser && (
        <button
          className="mobile-toggle-button"
          style={{
            ...styles.mobileToggle,
          }}
          onClick={() => setIsMobileOpen(!isMobileOpen)}
        >
          {isMobileOpen ? "✕" : "☰"}
        </button>
      )}

      {isMobileOpen && (
        <div style={styles.overlay} onClick={() => setIsMobileOpen(false)} />
      )}

      <div
        className={`sidebar-container ${isMobileOpen ? 'sidebar-open' : ''}`}
        style={{
          ...styles.sidebar,
        }}
      >
        {/* HEADER */}
        <div style={styles.header}>
          <h2 style={styles.logo}>💬 NAPCHAT</h2>
          <p style={styles.subtitle}>Stay connected, stay awesome</p>
        </div>

        {/* SEARCH */}
        <div style={styles.searchBox}>
          <div style={styles.searchWrapper}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              style={styles.searchInput}
            />
            {search && (
              <button 
                style={styles.clearBtn} 
                onClick={() => setSearch("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* USER LIST */}
        <div style={styles.list}>
          {filteredUsers.map((u) => {
            const isOnline = !!onlineUsers[u];
            const isActive = activeChat === u;

            return (
              <div
                key={u}
                onClick={() => openChat(u)}
                style={{
                  ...styles.user,
                  background: isActive ? "linear-gradient(135deg, #fff5f0 0%, #ffe8dc 100%)" : "transparent",
                  borderLeft: isActive ? "4px solid #ff6b35" : "4px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "#f9f9f9";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={styles.avatarWrapper}>
                  <div style={{
                    ...styles.avatar,
                    background: isActive 
                      ? "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)" 
                      : "linear-gradient(135deg, #ffb088 0%, #ffc7a8 100%)",
                    boxShadow: isActive ? "0 4px 12px rgba(255, 107, 53, 0.3)" : "none",
                  }}>
                    {u[0].toUpperCase()}
                  </div>
                  {isOnline && <div style={styles.onlineDot} />}
                </div>

                <div style={styles.userInfo}>
                  <div style={styles.nameRow}>
                    <span style={{
                      ...styles.name,
                      color: isActive ? "#ff6b35" : "#333"
                    }}>
                      {u}
                    </span>
                    {unread[u] > 0 && (
                      <span style={styles.badge}>{unread[u]}</span>
                    )}
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
                    <span style={{
                      ...styles.status,
                      color: isOnline ? "#22c55e" : "#999",
                    }}>
                      {isOnline ? "● Online" : "○ Offline"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🔍</div>
              <p style={styles.emptyText}>No users found</p>
              <p style={styles.emptySubtext}>Try a different search</p>
            </div>
          )}
        </div>

        {/* FOOTER - STICKY */}
        <div style={styles.footer}>
          <div style={styles.footerContent}>
            <div style={styles.currentUserAvatar}>
              {me?.[0]?.toUpperCase() || "?"}
            </div>
            <div style={styles.footerInfo}>
              <div style={styles.footerName}>{me}</div>
              <div style={styles.footerStatus}>● Active now</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        .mobile-toggle-button {
          display: none;
        }

        @media (max-width: 768px) {
          .mobile-toggle-button {
            display: flex !important;
          }

          .sidebar-container {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            z-index: 1600 !important;
            transform: translateX(-100%) !important;
            transition: transform 0.3s ease !important;
            box-shadow: 4px 0 20px rgba(0,0,0,0.15) !important;
          }

          .sidebar-container.sidebar-open {
            transform: translateX(0) !important;
          }
          
          ${selectedUser ? `
            .sidebar-container {
              display: none !important;
            }
            .mobile-toggle-button {
              display: none !important;
            }
          ` : ''}
        }
      `}</style>
    </>
  );
}

/* ================= STYLES ================= */

const styles = {
  sidebar: {
    width: 320,
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#ffffff",
    borderRight: "1px solid #f0f0f0",
    position: "relative",
    boxShadow: "2px 0 10px rgba(0,0,0,0.05)",
  },
  header: {
    padding: "24px 20px 20px",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    color: "#fff",
    boxShadow: "0 2px 10px rgba(255, 107, 53, 0.2)",
  },
  logo: { 
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-0.5px",
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: 13,
    opacity: 0.9,
    fontWeight: 400,
  },
  searchBox: {
    padding: "16px 16px 12px",
    borderBottom: "1px solid #f0f0f0",
    background: "#fafafa",
  },
  searchWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: 14,
    fontSize: 16,
    opacity: 0.5,
  },
  searchInput: {
    width: "100%",
    padding: "12px 40px 12px 42px",
    borderRadius: 24,
    border: "2px solid #f0f0f0",
    outline: "none",
    fontSize: 14,
    background: "#fff",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
  },
  clearBtn: {
    position: "absolute",
    right: 12,
    background: "#ff6b35",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: 20,
    height: 20,
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.8,
  },
  list: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
  },
  user: {
    display: "flex",
    gap: 14,
    padding: "14px 16px",
    cursor: "pointer",
    alignItems: "center",
    transition: "all 0.2s ease",
    position: "relative",
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    color: "#fff",
    fontWeight: 700,
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.3s ease",
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
    boxShadow: "0 0 0 2px rgba(34, 197, 94, 0.2)",
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  name: { 
    fontWeight: 600,
    fontSize: 15,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    transition: "color 0.2s ease",
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
    boxShadow: "0 2px 6px rgba(255, 107, 53, 0.3)",
  },
  status: { 
    fontSize: 13,
    fontWeight: 500,
  },
  typingWrapper: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  typing: {
    fontSize: 13,
    color: "#ff6b35",
    fontWeight: 600,
  },
  dots: {
    display: "inline-flex",
    gap: 2,
  },
  dot: {
    animation: "bounce 1.4s infinite ease-in-out",
    display: "inline-block",
    color: "#ff6b35",
    fontSize: 16,
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.3,
  },
  emptyText: {
    color: "#666",
    fontWeight: 600,
    fontSize: 16,
    margin: "0 0 8px",
  },
  emptySubtext: {
    color: "#999",
    fontSize: 13,
    margin: 0,
  },
  footer: {
    padding: 16,
    borderTop: "1px solid #f0f0f0",
    background: "#fafafa",
    position: "sticky",
    bottom: 0,
    boxShadow: "0 -2px 10px rgba(0,0,0,0.03)",
  },
  footerContent: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  currentUserAvatar: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(255, 107, 53, 0.2)",
  },
  footerInfo: {
    flex: 1,
    minWidth: 0,
  },
  footerName: {
    fontWeight: 700,
    fontSize: 15,
    color: "#333",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footerStatus: {
    fontSize: 12,
    color: "#22c55e",
    fontWeight: 600,
    marginTop: 2,
  },
  mobileToggle: {
    display: "none",
    position: "fixed",
    top: 16,
    left: 16,
    zIndex: 2000,
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    color: "#fff",
    fontSize: 24,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    boxShadow: "0 4px 12px rgba(255, 107, 53, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 1500,
    backdropFilter: "blur(2px)",
  },
};