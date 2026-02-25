import { io } from "socket.io-client";

// Prefer explicit socket URL, otherwise derive from API base URL
const RAW_API_URL = import.meta.env.VITE_API_BASE_URL || "";
const FALLBACK_URL = RAW_API_URL.replace("/api", "");

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || FALLBACK_URL || "http://localhost:5000";

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  withCredentials: true,
});

export default socket;
