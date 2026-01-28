import { setWithTTL } from "./redis.service.js";

export const saveMessageWithTTL = async (msgId, message) => {
  await setWithTTL(
    `msg:${msgId}`,
    message,
    86400
  );
};
