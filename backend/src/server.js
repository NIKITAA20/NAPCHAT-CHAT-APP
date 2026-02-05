import http from "http";
import express from "express";
import app from "./app.js";
import { initSocket } from "./config/socket.js";
import { logger } from "./utils/logger.js";
import dotenv from "dotenv";
import chatRoutes from "./routes/chat.routes.js";
import mediaRoutes from "./routes/media.routes.js";

dotenv.config();

app.use("/api/chat", chatRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/api/media", mediaRoutes);

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.success(`🚀 NapChat server running on port ${PORT}`);
});
