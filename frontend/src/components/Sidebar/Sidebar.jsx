import React, { useEffect, useState } from "react";
import socket from "../../services/socket";

export default function Sidebar({ setSelectedUser }) {
  const [users, setUsers] = useState([]);
  const [unread, setUnread] = useState({});
  const me = localStorage.getItem("username");

  useEffect(() => {
    socket.emit("register_user", me);

    socket.on("users_list", setUsers);

    socket.on("notify", () => {
      fetchUnread();
    });

    fetchUnread();
  }, []);

  const fetchUnread = async () => {
    const res = await fetch(`http://localhost:5000/api/chat/unread/${me}`);
    const data = await res.json();
    setUnread(data);
  };

  return (
    <div style={{ width: 260, background: "#111", color: "#fff" }}>
      <h3>Users</h3>

      {users.filter(u => u !== me).map((u) => (
        <div
          key={u}
          onClick={() => setSelectedUser(u)}
          style={{
            padding: 10,
            background: "#222",
            marginBottom: 5,
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between"
          }}
        >
          <span>{u}</span>

          {unread[u] > 0 && (
            <span style={{
              background: "red",
              borderRadius: "50%",
              padding: "2px 8px",
              fontSize: 12
            }}>
              {unread[u]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
