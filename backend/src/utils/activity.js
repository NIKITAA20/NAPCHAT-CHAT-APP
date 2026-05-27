import redis from "../config/redis.js";

const activityKey = (username) => `activity:${username}`;

/** Bump DM activity for both participants (most recent chat rises to top). */
export const bumpDmActivity = async (a, b) => {
  if (!a || !b) return;
  const ts = String(Date.now());
  await Promise.all([
    redis.hSet(activityKey(a), b, ts),
    redis.hSet(activityKey(b), a, ts),
  ]);
};

/** Bump group activity for every member (`group:<id>` field). */
export const bumpGroupActivity = async (groupId, members = []) => {
  if (!groupId || !members.length) return;
  const ts = String(Date.now());
  const field = `group:${groupId}`;
  await Promise.all(members.map((m) => redis.hSet(activityKey(m), field, ts)));
};

export const getActivityMap = async (username) => {
  const raw = await redis.hGetAll(activityKey(username));
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[k] = Number(v) || 0;
  }
  return out;
};
