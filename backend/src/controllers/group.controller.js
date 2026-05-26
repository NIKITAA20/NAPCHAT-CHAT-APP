import redis from "../config/redis.js";
import { randomUUID } from "crypto";
import { groupChatKey, loadMessages, saveMessage } from "../utils/messageStore.js";
import { getIO } from "../utils/io.js";

// Group data shape in Redis:
//   group:<id>                  HASH   { id, name, avatar, owner, createdAt }
//   group:<id>:members          SET    usernames
//   user:<username>:groups      SET    groupIds   (reverse-index for "my groups")
//
// All group chat history goes through messageStore (same TTL rules).

const groupKey = (id) => `group:${id}`;
const membersKey = (id) => `group:${id}:members`;
const userGroupsKey = (u) => `user:${u}:groups`;

/**
 * Persist a system message into the group chat ZSET and fan it out
 * to every currently-online member as a `group_message`. Membership is
 * read AFTER the calling code's mutation, so e.g. the user who just
 * left is intentionally NOT notified (they've left the room).
 */
const broadcastGroupSystem = async (groupId, text) => {
  const io = getIO();
  const stored = await saveMessage(groupChatKey(groupId), {
    system: true,
    text,
    groupId,
    time: Date.now(),
  });
  if (!io) return stored;

  const members = await redis.sMembers(`group:${groupId}:members`);
  await Promise.all(
    members.map(async (m) => {
      const sid = await redis.hGet("users:online", m);
      if (sid) io.to(sid).emit("group_message", stored);
    })
  );
  return stored;
};

const hydrateGroup = async (id) => {
  const [hash, members] = await Promise.all([
    redis.hGetAll(groupKey(id)),
    redis.sMembers(membersKey(id)),
  ]);
  if (!hash || !hash.id) return null;
  return {
    id: hash.id,
    name: hash.name,
    avatar: hash.avatar || null,
    owner: hash.owner,
    createdAt: Number(hash.createdAt) || 0,
    members,
  };
};

/* ============== CREATE GROUP ============== */
export const createGroup = async (req, res) => {
  try {
    const { name, owner, members = [], avatar } = req.body || {};
    if (!name?.trim() || !owner?.trim())
      return res.status(400).json({ error: "name and owner required" });

    const id = randomUUID();
    const memberSet = new Set([owner, ...members.filter(Boolean)]);

    const meta = {
      id,
      name: name.trim().slice(0, 60),
      avatar: avatar || "",
      owner,
      createdAt: String(Date.now()),
    };
    await redis.hSet(groupKey(id), meta);
    if (memberSet.size) await redis.sAdd(membersKey(id), [...memberSet]);
    await Promise.all(
      [...memberSet].map((u) => redis.sAdd(userGroupsKey(u), id))
    );

    await broadcastGroupSystem(id, `🎉 ${owner} created the group`);

    res.json(await hydrateGroup(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============== LIST MY GROUPS ============== */
export const listMyGroups = async (req, res) => {
  try {
    const { me } = req.params;
    const ids = await redis.sMembers(userGroupsKey(me));
    const groups = (await Promise.all(ids.map(hydrateGroup))).filter(Boolean);
    // Most recently created first
    groups.sort((a, b) => b.createdAt - a.createdAt);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============== GROUP DETAIL ============== */
export const getGroup = async (req, res) => {
  try {
    const g = await hydrateGroup(req.params.id);
    if (!g) return res.status(404).json({ error: "Group not found" });
    res.json(g);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============== ADD MEMBER ============== */
export const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, addedBy } = req.body || {};
    if (!username) return res.status(400).json({ error: "username required" });

    const exists = await redis.exists(groupKey(id));
    if (!exists) return res.status(404).json({ error: "Group not found" });

    // Don't duplicate-announce if they were already a member
    const wasMember = await redis.sIsMember(membersKey(id), username);

    await redis.sAdd(membersKey(id), username);
    await redis.sAdd(userGroupsKey(username), id);

    if (!wasMember) {
      const text = addedBy && addedBy !== username
        ? `👋 ${addedBy} added ${username} to the group`
        : `👋 ${username} joined the group`;
      await broadcastGroupSystem(id, text);
    }

    res.json(await hydrateGroup(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============== REMOVE MEMBER (leave or kick) ============== */
export const removeMember = async (req, res) => {
  try {
    const { id, username } = req.params;
    const removedBy = req.query.by;       // optional — passed when an admin kicks
    const wasMember = await redis.sIsMember(membersKey(id), username);

    await redis.sRem(membersKey(id), username);
    await redis.sRem(userGroupsKey(username), id);

    if (wasMember) {
      const text = removedBy && removedBy !== username
        ? `🚪 ${removedBy} removed ${username} from the group`
        : `🚪 ${username} left the group`;
      // Broadcast AFTER removal so the leaver isn't pinged.
      await broadcastGroupSystem(id, text);
    }

    res.json(await hydrateGroup(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ============== GROUP CHAT HISTORY ============== */
export const getGroupHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await loadMessages(groupChatKey(id));
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Helper exposed for socket.js so it can broadcast to all members.
export const getGroupMembers = async (id) => {
  return await redis.sMembers(membersKey(id));
};
