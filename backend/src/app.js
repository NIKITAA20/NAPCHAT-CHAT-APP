import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import mediaRoutes from "./routes/media.routes.js";

dotenv.config();

const app = express();


app.use(
  cors({
    origin: process.env.CLIENT_URL,   // ✅ frontend URL ONLY
    credentials: true,
  })
);


app.use(express.json());


app.get("/api", (req, res) => {
  res.send("API is working 🚀");
});


app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/media", mediaRoutes);
app.use("/uploads", express.static("uploads"));
export default app;
