import http from "http";
import app from "./app.js";
import { initSocket } from "./config/socket.js";
import { logger } from "./utils/logger.js";
import dotenv from "dotenv";
import chatRoutes from "./routes/chat.routes.js";

app.use("/api/chat", chatRoutes);


dotenv.config();

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize socket.io
initSocket(server);

// Start server
server.listen(PORT, () => {
  logger.success(`🚀 NapChat server running on port ${PORT}`);
});

// Handle unexpected errors
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:");
  console.error(err);
});

process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection:");
  console.error(err);
});
