import express from "express";
import redis from "../config/redis.js";

const router = express.Router();

// ================= CHAT HISTORY =================
router.get("/history/:me/:user", async (req, res) => {
  const { me, user } = req.params;

  const data = await redis.lRange(`chat:${me}:${user}`, 0, -1);
  const messages = data.map((m) => JSON.parse(m));

  res.json(messages);
});

// ================= UNREAD COUNT (FIXED) =================
router.get("/unread/:user", async (req, res) => {
  try {
    const { user } = req.params;

    const unread = await redis.hGetAll(`unread:${user}`);

    res.json(unread || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
