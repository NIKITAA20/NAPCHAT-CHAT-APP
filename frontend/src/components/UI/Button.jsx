import React from "react";

const Button = ({ text, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 15px",
        background: "#ff6b6b",
        border: "none",
        color: "#fff",
        borderRadius: 5,
        cursor: "pointer",
      }}
    >
      {text}
    </button>
  );
};

export default Button;
