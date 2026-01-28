import React, { useState } from "react";

export default function Login() {
  const [username, setUsername] = useState("");

  const handleLogin = () => {
    if (!username.trim()) {
      alert("Enter username");
      return;
    }

    localStorage.setItem("username", username);
    window.location.href = "/chat";
  };

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "#0b141a"
    }}>
      <div style={{
        background: "#1f2c33",
        padding: 30,
        borderRadius: 10,
        width: 300,
        color: "white"
      }}>
        <h2>Login</h2>

        <input
          placeholder="Enter username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: "100%", padding: 10, marginTop: 10 }}
        />

        <button
          onClick={handleLogin}
          style={{
            width: "100%",
            marginTop: 15,
            padding: 10,
            background: "#25D366",
            color: "black",
            border: "none",
            cursor: "pointer"
          }}
        >
          Login
        </button>
      </div>
    </div>
  );
}
