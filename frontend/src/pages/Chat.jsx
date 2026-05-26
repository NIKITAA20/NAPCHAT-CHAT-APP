import React, { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar/Sidebar";
import ChatBox from "../components/Chat/ChatBox";
import CallOverlay from "../components/Call/CallOverlay";
import IncomingCall from "../components/Call/IncomingCall";
import GroupCallOverlay from "../components/Call/GroupCallOverlay";
import IncomingGroupCall from "../components/Call/IncomingGroupCall";
import API from "../services/api";
import socket from "../services/socket";

export default function Chat() {
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [callUser, setCallUser] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [showCall, setShowCall] = useState(false);
  const [groupCallId, setGroupCallId] = useState(null);
  const [groupInvite, setGroupInvite] = useState(null); // { groupId, groupName, initiator }

  // Helpers — opening one target clears the other.
  const openUser = (u) => { setSelectedGroup(null); setSelectedUser(u); };
  const openGroup = (g) => { setSelectedUser(null); setSelectedGroup(g); };
  const hasChat = !!(selectedUser || selectedGroup);

  const callAccepted = useRef(false);
  const callActiveRef = useRef(false);
  const me = localStorage.getItem("username");

  /* 🔥 SOCKET LISTENERS (ONLY ONCE) */
  useEffect(() => {
    const handleIncoming = ({ from, offer }) => {
      if (!from || callActiveRef.current) {
        console.warn(
          "⚠️ incoming-call blocked:",
          !from ? "from is undefined" : "call already active"
        );
        return;
      }

      console.log("📞 INCOMING CALL FROM:", from);
      callActiveRef.current = true;

      setCallUser(from);
      setIncomingOffer(offer);
      setShowCall(false);
    };

    socket.off("incoming-call");
    socket.on("incoming-call", handleIncoming);

    // === GROUP CALL INVITATION ===
    // Fired when ANOTHER member started a call we're not yet in.
    // We refuse to overwrite an existing dialog so a second concurrent
    // call doesn't kill the one you're already deciding on.
    const handleGroupInvite = async ({ groupId, initiator }) => {
      // Ignore if I'm already in this exact call, or if the popup is up.
      if (groupCallId === groupId) return;
      setGroupInvite((cur) => {
        if (cur && cur.groupId === groupId) return cur;
        return { groupId, initiator, groupName: groupId };
      });

      // Best-effort: fetch the friendly group name for the dialog.
      try {
        const { data } = await API.get(`/groups/${groupId}`);
        setGroupInvite((cur) =>
          cur && cur.groupId === groupId ? { ...cur, groupName: data.name } : cur
        );
      } catch {}
    };
    const handleGroupInviteCancel = ({ groupId }) => {
      setGroupInvite((cur) => (cur && cur.groupId === groupId ? null : cur));
    };
    socket.on("group_call_invitation", handleGroupInvite);
    socket.on("group_call_invitation_cancelled", handleGroupInviteCancel);

    return () => {
      socket.off("incoming-call", handleIncoming);
      socket.off("group_call_invitation", handleGroupInvite);
      socket.off("group_call_invitation_cancelled", handleGroupInviteCancel);
    };
  }, [groupCallId]);

  const resetCall = () => {
    callAccepted.current = false;
    callActiveRef.current = false;
    setCallUser(null);
    setIncomingOffer(null);
    setShowCall(false);
  };

  const handleBackToSidebar = () => {
    setSelectedUser(null);
    setSelectedGroup(null);
    localStorage.removeItem("activeChat");
  };

  return (
    <>
      <div className="app-shell" data-has-chat={hasChat ? "true" : "false"}>
        {/* SIDEBAR PANE */}
        <aside className="pane pane-sidebar">
          <Sidebar
            setSelectedUser={openUser}
            selectedUser={selectedUser}
            setSelectedGroup={openGroup}
            selectedGroup={selectedGroup}
          />
        </aside>

        {/* MAIN PANE */}
        <main className="pane pane-main">
          {selectedUser ? (
            <ChatBox
              user={selectedUser}
              onCall={() => {
                setCallUser(selectedUser);
                setShowCall(true);
              }}
              onBack={handleBackToSidebar}
            />
          ) : selectedGroup ? (
            <ChatBox
              key={selectedGroup.id}
              group={selectedGroup}
              onCall={() => setGroupCallId(selectedGroup.id)}
              onBack={handleBackToSidebar}
              onGroupUpdated={(g) => setSelectedGroup(g)}
              onLeft={() => { setSelectedGroup(null); }}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-header">
                <div className="brand">
                  <span className="brand-icon">💬</span>
                  <span className="brand-text">NAPCHAT</span>
                </div>
                <div className="me-chip">
                  <div className="me-avatar">{me?.charAt(0).toUpperCase()}</div>
                  <span className="me-name">{me}</span>
                </div>
              </div>
              <div className="empty-body">
                <div className="empty-icon">👻</div>
                <h2 className="empty-title">Welcome to NAPCHAT</h2>
                <p className="empty-sub">
                  Pick a contact on the left and say hi.
                  <br />
                  Messages disappear automatically after 24 hours.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 🔔 RECEIVER POPUP */}
      {incomingOffer && !showCall && (
        <IncomingCall
          from={callUser}
          onAccept={() => {
            callAccepted.current = true;
            callActiveRef.current = true;
            setShowCall(true);
          }}
          onReject={resetCall}
        />
      )}

      {/* 📞 CALL SCREEN */}
      {callUser && showCall && (
        <CallOverlay
          key={`${callUser}-${!!incomingOffer}`}
          user={callUser}
          incoming={!!incomingOffer}
          offer={incomingOffer}
          onClose={resetCall}
        />
      )}

      {/* 🎥 GROUP VIDEO CALL */}
      {groupCallId && (
        <GroupCallOverlay
          groupId={groupCallId}
          me={me}
          onClose={() => setGroupCallId(null)}
        />
      )}

      {/* 🔔 INCOMING GROUP CALL — hide while we're already in a call */}
      {groupInvite && !groupCallId && (
        <IncomingGroupCall
          groupId={groupInvite.groupId}
          groupName={groupInvite.groupName}
          initiator={groupInvite.initiator}
          onAccept={() => {
            const gid = groupInvite.groupId;
            setGroupInvite(null);
            setGroupCallId(gid);
          }}
          onReject={() => setGroupInvite(null)}
        />
      )}

      <style>{`
        /* ---------- GLOBAL RESET FOR SHELL ---------- */
        :root { color-scheme: light; }
        html, body, #root {
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        * { box-sizing: border-box; }

        /* ---------- APP GRID SHELL ---------- */
        .app-shell {
          display: grid;
          grid-template-columns: minmax(280px, 340px) 1fr;
          height: 100dvh;        /* dynamic viewport — no Safari URL-bar jump */
          width: 100vw;
          background: linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
        }
        .pane {
          min-width: 0;
          min-height: 0;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .pane-sidebar { border-right: 1px solid rgba(255,107,53,0.08); background: #fff; }
        .pane-main    { background: linear-gradient(135deg, #fff5eb 0%, #ffe8d6 100%); }

        /* ---------- EMPTY STATE ---------- */
        .empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .empty-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
          color: #fff;
          box-shadow: 0 2px 8px rgba(255,107,53,0.2);
          flex-shrink: 0;
          gap: 12px;
        }
        .brand { display: flex; align-items: center; gap: 10px; }
        .brand-icon { font-size: 26px; }
        .brand-text { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
        .me-chip {
          display: flex; align-items: center; gap: 10px;
          padding: 6px 14px 6px 6px;
          background: rgba(255,255,255,0.22);
          border-radius: 30px;
          backdrop-filter: blur(8px);
        }
        .me-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: #fff; color: #ff6b35;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 14px;
        }
        .me-name { font-size: 14px; font-weight: 600; }
        .empty-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          min-height: 0;
        }
        .empty-icon { font-size: 80px; margin-bottom: 14px; opacity: 0.7; }
        .empty-title { margin: 0 0 10px; color: #ff6b35; font-size: 28px; font-weight: 700; }
        .empty-sub { margin: 0; color: #666; font-size: 15px; line-height: 1.5; max-width: 360px; }

        /* ---------- MOBILE: SINGLE COLUMN, SWAP PANES ---------- */
        @media (max-width: 768px) {
          .app-shell {
            grid-template-columns: 1fr;
          }
          /* When a chat is open: hide sidebar, show main.
             When no chat is open: show sidebar, hide main. */
          .app-shell[data-has-chat="true"]  .pane-sidebar { display: none; }
          .app-shell[data-has-chat="false"] .pane-main    { display: none; }

          .pane-sidebar { border-right: none; }
          .empty-icon { font-size: 64px; }
          .empty-title { font-size: 22px; }
          .empty-sub { font-size: 14px; }
          .empty-header { padding: 14px 18px; }
          .brand-text { font-size: 19px; }
        }
      `}</style>
    </>
  );
}
