import redis from "../config/redis.js";

// blocked:<me>  →  SET of usernames that <me> has blocked.
// Block semantics (one-way):
//   - <me> never sees <target> in the user list / sidebar.
//   - <target>'s private messages + call invites to <me> are silently
//     dropped on the server. <target> continues to function normally
//     and is NOT notified they were blocked.
const blockKey = (me) => `blocked:${me}`;

export const listBlocked = async (req, res) => {
  try {
    const { me } = req.params;
    const items = await redis.sMembers(blockKey(me));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const blockUser = async (req, res) => {
  try {
    const { me } = req.params;
    const { target } = req.body || {};
    if (!target) return res.status(400).json({ error: "target required" });
    if (target === me) return res.status(400).json({ error: "Cannot block yourself" });

    await redis.sAdd(blockKey(me), target);
    res.json({ success: true, blocked: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { me, target } = req.params;
    await redis.sRem(blockKey(me), target);
    res.json({ success: true, unblocked: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Small helper so socket.js can ask "did receiver block sender?"
// without re-importing redis directly.
export const isBlocked = async (me, target) => {
  if (!me || !target) return false;
  return Boolean(await redis.sIsMember(blockKey(me), target));
};
