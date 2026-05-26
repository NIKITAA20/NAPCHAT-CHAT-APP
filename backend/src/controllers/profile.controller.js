import redis from "../config/redis.js";

// User profile is stored as a Redis hash:
//   key:    user:profile:<username>
//   fields: avatar (base64 data URL — small, ~10-20KB), bio, color
//
// We deliberately keep avatars as data URLs instead of files so they're
// exempt from the 24h uploads sweep (profile pics shouldn't disappear).

const profileKey = (username) => `user:profile:${username}`;

// Trim a profile object for over-the-wire shape — never leak unknown keys.
const shapeProfile = (username, hash) => ({
  username,
  avatar: hash?.avatar || null,
  bio: hash?.bio || "",
  color: hash?.color || null,
});

export const getProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const data = await redis.hGetAll(profileKey(username));
    res.json(shapeProfile(username, data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getProfilesBulk = async (req, res) => {
  try {
    const raw = req.query.usernames || "";
    const usernames = raw
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    if (!usernames.length) return res.json({});

    const pipeline = redis.multi();
    usernames.forEach((u) => pipeline.hGetAll(profileKey(u)));
    const results = await pipeline.exec();

    const out = {};
    usernames.forEach((u, i) => {
      out[u] = shapeProfile(u, results[i]);
    });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const { avatar, bio, color } = req.body || {};

    // Hard cap on avatar size to prevent abuse — ~150KB of base64
    // (which is roughly a 100KB image, plenty for a 200x200 avatar).
    if (avatar && avatar.length > 200_000) {
      return res.status(413).json({ error: "Avatar too large. Please use a smaller image." });
    }

    const patch = {};
    if (typeof avatar === "string") patch.avatar = avatar;
    if (typeof bio === "string") patch.bio = bio.slice(0, 200);
    if (typeof color === "string") patch.color = color.slice(0, 16);

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    await redis.hSet(profileKey(username), patch);
    const data = await redis.hGetAll(profileKey(username));
    res.json(shapeProfile(username, data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
