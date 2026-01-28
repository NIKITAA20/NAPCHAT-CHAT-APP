import React, { useState } from "react";

const ChatInput = () => {
  const [msg, setMsg] = useState("");

  return (
    <div style={{ marginTop: 10 }}>
      <input
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="Type message..."
        style={{ padding: 10, width: "80%" }}
      />
      <button style={{ padding: 10 }}>Send</button>
    </div>
  );
};

export default ChatInput;
