import redis from "../config/redis.js";
import { randomUUID } from "crypto";

// Snapchat-style ephemeral messages with seen-based TTL.
//
// Two timing knobs:
//   INITIAL_TTL_MS  — how long an UNSEEN message survives. We default
//                     to 7 days so an offline receiver still finds the
//                     message when they next come online.
//   SEEN_TTL_MS     — how long a message survives AFTER the receiver
//                     opens the chat and "sees" it. Default 24h.
//
// Each chat is a Redis ZSET (`chat:<a>:<b>` for 1-1, `chat:group:<id>`
// for groups). Score = current expiry timestamp (ms). Member = the
// JSON-serialised message (with an `id` so we can find it later when
// updating expiry on seen).

export const INITIAL_TTL_MS =
  Number(process.env.MESSAGE_INITIAL_TTL_MS) || 7 * 24 * 60 * 60 * 1000;
export const SEEN_TTL_MS =
  Number(process.env.MESSAGE_SEEN_TTL_MS) || 24 * 60 * 60 * 1000;

// Belt-and-braces: also expire the whole key shortly after its newest
// entry would expire. Even if our prune logic ever misses, Redis still
// reclaims memory.
const keySafetySeconds = () =>
  Math.ceil(Math.max(INITIAL_TTL_MS, SEEN_TTL_MS) / 1000) + 120;

export const chatKey = (a, b) => `chat:${[a, b].sort().join(":")}`;
export const groupChatKey = (groupId) => `chat:group:${groupId}`;

/**
 * Persist a message into a chat ZSET with INITIAL_TTL expiry.
 * The message gets a stable `id` so we can find + re-score it later.
 */
export const saveMessage = async (key, msg) => {
  const now = Date.now();
  const id = msg.id || randomUUID();
  const expiresAt = now + INITIAL_TTL_MS;
  const enriched = { ...msg, id, expiresAt, seenAt: null };

  await redis.zRemRangeByScore(key, "-inf", now);
  await redis.zAdd(key, {
    score: expiresAt,
    value: JSON.stringify(enriched),
  });
  await redis.expire(key, keySafetySeconds());

  return enriched;
};

/**
 * Load all non-expired messages for a chat, oldest first.
 * Side effect: prunes anything already past its expiry.
 */
export const loadMessages = async (key) => {
  const now = Date.now();
  await redis.zRemRangeByScore(key, "-inf", now);
  const raw = await redis.zRange(key, 0, -1);
  return raw
    .map((m) => {
      try {
        return JSON.parse(m);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

/**
 * Mark every message in `key` sent by `senderFilter` (and not yet seen)
 * as seen by the viewer. Resets each one's expiry to now + SEEN_TTL_MS.
 *
 * Returns the list of message IDs that were just marked seen, so the
 * caller can notify the original sender(s) for read-receipt UI.
 */
export const markSeen = async (key, senderFilter) => {
  const now = Date.now();
  const newExpiry = now + SEEN_TTL_MS;

  const raw = await redis.zRange(key, 0, -1);
  const ids = [];

  for (const entry of raw) {
    let msg;
    try { msg = JSON.parse(entry); } catch { continue; }

    if (msg.seenAt) continue;                          // already seen
    if (msg.system) continue;                          // system msg → no read receipt
    if (senderFilter && msg.from !== senderFilter) continue;

    msg.seenAt = now;
    msg.expiresAt = newExpiry;
    const updated = JSON.stringify(msg);

    // ZSET membership is by value — remove the old serialisation,
    // add the new one with the new score.
    await redis.zRem(key, entry);
    await redis.zAdd(key, { score: newExpiry, value: updated });
    ids.push(msg.id);
  }

  if (ids.length) await redis.expire(key, keySafetySeconds());
  return ids;
};

// Back-compat default — older code that imported TTL_MS still works.
export const TTL_MS = INITIAL_TTL_MS;
