import express from "express";
import redis from "../config/redis.js";
import { getUser } from "../controllers/user.controller.js";

const router = express.Router();

// ✅ ALL USERS (SIDEBAR)
router.get("/", async (req, res) => {
  const users = await redis.sMembers("users:all");
  res.json(users);
});

// single user
router.get("/:id", getUser);

export default router;
