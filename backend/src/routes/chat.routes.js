import express from "express";
import redis from "../config/redis.js";

const router = express.Router();

// Get chat history
router.get("/history/:me/:user", async (req, res) => {
  const { me, user } = req.params;

  const data = await redis.lRange(`chat:${me}:${user}`, 0, -1);
  const messages = data.map((m) => JSON.parse(m));

  res.json(messages);
});

export default router;
