import React, { useState } from "react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleLogin = () => {
    if (!username.trim()) {
      alert("Please enter a username");
      return;
    }

    localStorage.setItem("username", username);
    window.location.href = "/chat";
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div style={styles.container}>
      {/* Animated Background */}
      <div style={styles.bgCircle1}></div>
      <div style={styles.bgCircle2}></div>
      <div style={styles.bgCircle3}></div>

      <div style={styles.card}>
        {/* Logo Section */}
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>💬</div>
          <h1 style={styles.appName}>NAPCHAT</h1>
          <p style={styles.tagline}>Connect • Chat • Enjoy</p>
        </div>

        {/* Divider */}
        <div style={styles.divider}></div>

        {/* Login Form */}
        <div style={styles.formSection}>
          <h2 style={styles.heading}>Welcome Back!</h2>
          <p style={styles.subheading}>Enter your username to continue</p>

          <div style={styles.inputWrapper}>
            <span style={styles.inputIcon}>👤</span>
            <input
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={{
                ...styles.input,
                borderColor: isFocused ? "#ff6b35" : "#ffe4d6",
                boxShadow: isFocused ? "0 0 0 3px rgba(255, 107, 53, 0.1)" : "none",
              }}
            />
          </div>

          <button
            onClick={handleLogin}
            style={styles.button}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(255, 107, 53, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(255, 107, 53, 0.3)";
            }}
          >
            Let's Chat! 🚀
          </button>

          <p style={styles.footer}>
            New here? Just pick a username and start chatting!
          </p>
        </div>
      </div>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.1); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, 40px) scale(1.15); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 30px) scale(1.08); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }

        @media (max-width: 480px) {
          .login-card {
            width: 90% !important;
            margin: 0 20px !important;
            padding: 24px !important;
          }
          .app-name {
            font-size: 32px !important;
          }
          .logo-icon {
            font-size: 48px !important;
            width: 80px !important;
            height: 80px !important;
          }
        }

        @media (max-width: 360px) {
          .login-card {
            padding: 20px !important;
          }
          .form-heading {
            font-size: 22px !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #ff8c42 0%, #ff6b35 50%, #ff5722 100%)",
    position: "relative",
    overflow: "hidden",
    padding: "20px",
  },
  bgCircle1: {
    position: "absolute",
    width: "400px",
    height: "400px",
    borderRadius: "50%",
    background: "rgba(255, 255, 255, 0.1)",
    top: "-100px",
    right: "-100px",
    animation: "float1 8s ease-in-out infinite",
  },
  bgCircle2: {
    position: "absolute",
    width: "300px",
    height: "300px",
    borderRadius: "50%",
    background: "rgba(255, 255, 255, 0.08)",
    bottom: "-80px",
    left: "-80px",
    animation: "float2 10s ease-in-out infinite",
  },
  bgCircle3: {
    position: "absolute",
    width: "200px",
    height: "200px",
    borderRadius: "50%",
    background: "rgba(255, 255, 255, 0.12)",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    animation: "float3 6s ease-in-out infinite",
  },
  card: {
    background: "#ffffff",
    padding: "40px 32px",
    borderRadius: "24px",
    width: "100%",
    maxWidth: "420px",
    color: "#333",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
    position: "relative",
    zIndex: 10,
    className: "login-card",
  },
  logoSection: {
    textAlign: "center",
    marginBottom: "24px",
  },
  logoIcon: {
    fontSize: "64px",
    width: "100px",
    height: "100px",
    margin: "0 auto 16px",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 24px rgba(255, 107, 53, 0.3)",
    animation: "pulse 2s ease-in-out infinite",
    className: "logo-icon",
  },
  appName: {
    margin: "0 0 8px",
    fontSize: "42px",
    fontWeight: "800",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    letterSpacing: "-1px",
    className: "app-name",
  },
  tagline: {
    margin: 0,
    fontSize: "14px",
    color: "#999",
    fontWeight: "500",
  },
  divider: {
    height: "1px",
    background: "linear-gradient(90deg, transparent, #ffb088, transparent)",
    margin: "24px 0",
  },
  formSection: {
    textAlign: "center",
  },
  heading: {
    margin: "0 0 8px",
    fontSize: "26px",
    fontWeight: "700",
    color: "#333",
    className: "form-heading",
  },
  subheading: {
    margin: "0 0 24px",
    fontSize: "14px",
    color: "#666",
  },
  inputWrapper: {
    position: "relative",
    marginBottom: "20px",
  },
  inputIcon: {
    position: "absolute",
    left: "16px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "20px",
    zIndex: 1,
  },
  input: {
    width: "100%",
    padding: "16px 16px 16px 50px",
    fontSize: "16px",
    border: "2px solid #ffe4d6",
    borderRadius: "12px",
    outline: "none",
    transition: "all 0.3s ease",
    fontFamily: "inherit",
    background: "#fafafa",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "16px",
    fontSize: "16px",
    fontWeight: "700",
    background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 4px 15px rgba(255, 107, 53, 0.3)",
    marginBottom: "16px",
  },
  footer: {
    margin: "16px 0 0",
    fontSize: "13px",
    color: "#999",
  },
};