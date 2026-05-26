import express from "express";
import redis from "../config/redis.js";
import { getUser } from "../controllers/user.controller.js";
import {
  getProfile,
  getProfilesBulk,
  updateProfile,
} from "../controllers/profile.controller.js";
import {
  listBlocked,
  blockUser,
  unblockUser,
} from "../controllers/block.controller.js";

const router = express.Router();

// ✅ ALL USERS (SIDEBAR)
router.get("/", async (req, res) => {
  const users = await redis.sMembers("users:all");
  res.json(users);
});

/* ===================== PROFILES =====================
   Mounted at /api/users
   GET    /profile/bulk?usernames=a,b,c   → bulk lookup map
   GET    /profile/:username              → one profile
   PUT    /profile/:username              → update own profile
   NOTE: "bulk" route is declared BEFORE "/:username" so Express
         doesn't treat the literal "bulk" as a username param.
*/
router.get("/profile/bulk", getProfilesBulk);
router.get("/profile/:username", getProfile);
router.put("/profile/:username", updateProfile);

/* ===================== BLOCK LIST ===================
   GET    /:me/blocked          → list usernames I've blocked
   POST   /:me/block            → body { target }
   DELETE /:me/block/:target    → unblock
*/
router.get("/:me/blocked", listBlocked);
router.post("/:me/block", blockUser);
router.delete("/:me/block/:target", unblockUser);

// single user (legacy stub) — keep last so it doesn't swallow above paths
router.get("/:id", getUser);

export default router;
