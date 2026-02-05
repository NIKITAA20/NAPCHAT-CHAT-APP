import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import chatRoutes from "./routes/chat.routes.js";

const app = express();

  app.use(
  cors({
    origin: true,          
    credentials: true,
  })
);


app.use(express.json());

// health check
app.get("/api", (req, res) => {
  res.send("API is working 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);

export default app;
