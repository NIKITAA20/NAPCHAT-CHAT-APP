import http from "http";
import app from "./app.js";
import { initSocket } from "./config/socket.js";
import dotenv from "dotenv";
import { logger } from "./utils/logger.js";

dotenv.config();

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.success(`🚀 NapChat server running on port ${PORT}`);
});
