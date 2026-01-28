import { publishMessage } from "./redis.service.js";

// User joins voice room
export const joinVoiceRoom = async (roomId, userId) => {
  await publishMessage("voice-join", {
    roomId,
    userId,
  });
};

// WebRTC Offer
export const sendOffer = async (roomId, offer) => {
  await publishMessage("voice-offer", {
    roomId,
    offer,
  });
};

// WebRTC Answer
export const sendAnswer = async (roomId, answer) => {
  await publishMessage("voice-answer", {
    roomId,
    answer,
  });
};

// ICE Candidate exchange
export const sendIceCandidate = async (roomId, candidate) => {
  await publishMessage("voice-ice", {
    roomId,
    candidate,
  });
};
