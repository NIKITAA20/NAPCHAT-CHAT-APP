import { createClient } from "redis";

const redis = createClient({
  url: "redis://localhost:6379",
});

redis.on("connect", () => {
  console.log("✅ Redis Connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis Error:", err);
});

await redis.connect();

export default redis;
