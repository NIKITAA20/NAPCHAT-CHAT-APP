import React from "react";

const Message = ({ text, sender }) => {
  return (
    <div
      style={{
        textAlign: sender === "user" ? "right" : "left",
        margin: "10px 0",
      }}
    >
      <span
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          background: sender === "user" ? "#6c5ce7" : "#dfe6e9",
          color: sender === "user" ? "#fff" : "#000",
        }}
      >
        {text}
      </span>
    </div>
  );

};

export default Message;
