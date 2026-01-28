import React, { useState } from "react";
import Sidebar from "../components/Sidebar/Sidebar";
import ChatBox from "../components/Chat/ChatBox";

export default function Chat() {
  const [selectedUser, setSelectedUser] = useState(null);
  const me = localStorage.getItem("username");

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      
      <Sidebar setSelectedUser={setSelectedUser} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 10, background: "#222", color: "#fff" }}>
          👤 Logged in as: <b>{me}</b>
        </div>

        {selectedUser ? (
          <ChatBox user={selectedUser} />
        ) : (
          <h2 style={{ margin: "auto", color: "#888" }}>
            Select a user to start chatting
          </h2>
        )}
      </div>
    </div>
  );
}
