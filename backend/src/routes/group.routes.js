import express from "express";
import {
  createGroup,
  listMyGroups,
  getGroup,
  addMember,
  removeMember,
  getGroupHistory,
} from "../controllers/group.controller.js";

const router = express.Router();

router.post("/", createGroup);
router.get("/mine/:me", listMyGroups);
router.get("/:id", getGroup);
router.get("/:id/history", getGroupHistory);
router.post("/:id/members", addMember);
router.delete("/:id/members/:username", removeMember);

export default router;
