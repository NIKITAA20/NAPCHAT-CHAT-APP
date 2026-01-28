import redis from "../config/redis.js";

// Publish message (for chat / voice)
export const publishMessage = async (channel, data) => {
  await redis.publish(channel, JSON.stringify(data));
};

// Save data with TTL
export const setWithTTL = async (key, value, ttl = 86400) => {
  await redis.set(key, JSON.stringify(value), {
    EX: ttl,
  });
};

// Get stored data
export const getData = async (key) => {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
};
