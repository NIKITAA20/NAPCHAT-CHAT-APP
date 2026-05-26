import express from "express";
import redis from "../config/redis.js";
import { chatKey, loadMessages, TTL_MS } from "../utils/messageStore.js";

const router = express.Router();

// ================= CHAT HISTORY =================
// Only returns non-expired messages. Expired ones are pruned on access.
router.get("/history/:me/:user", async (req, res) => {
  const { me, user } = req.params;
  const messages = await loadMessages(chatKey(me, user));
  res.json(messages);
});

// Expose the configured TTL so the client can render the
// "X left" indicator without hardcoding the value.
router.get("/ttl", (_req, res) => {
  res.json({ ttlMs: TTL_MS });
});

// ================= UNREAD COUNT =================
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
