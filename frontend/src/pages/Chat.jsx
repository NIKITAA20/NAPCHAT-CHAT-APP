import React, { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar/Sidebar";
import ChatBox from "../components/Chat/ChatBox";
import CallOverlay from "../components/Call/CallOverlay";
import IncomingCall from "../components/Call/IncomingCall";
import socket from "../services/socket";

export default function Chat() {
  const [selectedUser, setSelectedUser] = useState(null);
  const [callUser, setCallUser] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [showCall, setShowCall] = useState(false);

  const ringTimer = useRef(null);
  const callAccepted = useRef(false); // ✅ FIX: track acceptance reliably (not React state)
  const me = localStorage.getItem("username");

  /* 🔥 SOCKET LISTENERS (ONLY ONCE) */
  useEffect(() => {
    socket.on("incoming-call", ({ from, offer }) => {
      console.log("📞 INCOMING CALL FROM:", from);

      callAccepted.current = false; // reset for new call
      setCallUser(from);
      setIncomingOffer(offer);
      setShowCall(false);

      ringTimer.current = setTimeout(() => {
        // ✅ FIX 1: Guard — only fire if call was NOT accepted
        if (!callAccepted.current) {
          socket.emit("call-missed", { to: from }); // ✅ FIX 2: correct event name (was "missed-call")
          socket.emit("end-call", { to: from });
          resetCall();
        }
      }, 20000);
    });

    socket.on("call-ended", () => {
      resetCall();
    });

    return () => {
      socket.off("incoming-call");
      socket.off("call-ended");
    };
  }, []);

  const resetCall = () => {
    clearTimeout(ringTimer.current);
    ringTimer.current = null;       // ✅ FIX 3: nullify so stale ref can't fire
    callAccepted.current = false;
    setCallUser(null);
    setIncomingOffer(null);
    setShowCall(false);
  };

  const handleBackToSidebar = () => {
    setSelectedUser(null);
    localStorage.removeItem("activeChat");
  };

  return (
    <>
      <div style={styles.container}>
        {/* SIDEBAR */}
        <Sidebar 
          setSelectedUser={setSelectedUser}
          selectedUser={selectedUser}
        />

        <div style={styles.mainContent}>
          <div 
            style={styles.header}
            className="main-header"
          >
            <div style={styles.logoSection}>
              <span style={styles.logoIcon}>💬</span>
              <span style={styles.logoText}>NAPCHAT</span>
            </div>
            <div style={styles.userSection}>
              <div style={styles.userAvatar}>
                {me?.charAt(0).toUpperCase()}
              </div>
              <span style={styles.username}>{me}</span>
            </div>
          </div>

          {/* Chat Area */}
          {selectedUser ? (
            <ChatBox
              user={selectedUser}
              onCall={() => {
                setCallUser(selectedUser);
                setShowCall(true);
              }}
              onBack={handleBackToSidebar}
            />
          ) : (
            <div style={styles.emptyState} className="empty-state">
              <div style={styles.emptyIcon}>💬</div>
              <h2 style={styles.emptyTitle}>Welcome to NAPCHAT</h2>
              <p style={styles.emptyText}>Select a contact to start chatting</p>
            </div>
          )}
        </div>

        {/* 🔔 RECEIVER POPUP */}
        {incomingOffer && !showCall && (
          <IncomingCall
            from={callUser}
            onAccept={() => {
              callAccepted.current = true;  // ✅ FIX: mark accepted before clearing timer
              clearTimeout(ringTimer.current);
              ringTimer.current = null;     // ✅ FIX: nullify immediately
              setShowCall(true);
            }}
            onReject={resetCall}
          />
        )}

        {/* 📞 CALL SCREEN */}
        {callUser && showCall && (
          <CallOverlay
            key={callUser}              // ✅ prevents stale component reuse
            user={callUser}
            incoming={!!incomingOffer}
            offer={incomingOffer}
            onClose={resetCall}
          />
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .main-header {
            display: ${selectedUser ? 'none' : 'flex'} !important;
          }
          
          .empty-state {
            display: ${selectedUser ? 'none' : 'flex'} !important;
          }
        }
      `}</style>
    </>
  );
}

const styles = {
  container: {
    display: "flex",
    height: "100vh",
    background: "linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflow: "hidden",
  },
  mainContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 24px",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    boxShadow: "0 2px 8px rgba(255, 107, 53, 0.2)",
    flexWrap: "wrap",
    gap: "12px",
  },
  logoSection: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logoIcon: {
    fontSize: "28px",
    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
  },
  logoText: {
    fontSize: "24px",
    fontWeight: "800",
    color: "#fff",
    letterSpacing: "1px",
    textShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  userSection: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    background: "rgba(255, 255, 255, 0.2)",
    padding: "8px 16px",
    borderRadius: "30px",
    backdropFilter: "blur(10px)",
  },
  userAvatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #fff 0%, #ffe8d6 100%)",
    color: "#ff6b35",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
    fontSize: "16px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
  },
  username: {
    color: "#fff",
    fontWeight: "600",
    fontSize: "15px",
    textShadow: "0 1px 2px rgba(0,0,0,0.1)",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 20px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "80px",
    marginBottom: "20px",
    opacity: 0.6,
    animation: "pulse 2s ease-in-out infinite",
  },
  emptyTitle: {
    margin: "0 0 12px 0",
    color: "#ff6b35",
    fontSize: "28px",
    fontWeight: "700",
  },
  emptyText: {
    margin: 0,
    color: "#666",
    fontSize: "16px",
    fontWeight: "400",
  },
};