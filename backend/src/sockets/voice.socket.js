import {
  joinVoiceRoom,
  sendOffer,
  sendAnswer,
  sendIceCandidate
} from "../services/voice.service.js";

export default function voiceSocket(io, socket) {

  socket.on("join_voice", ({ roomId, userId }) => {
    socket.join(roomId);
    joinVoiceRoom(roomId, userId);
  });

  socket.on("voice_offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("voice_offer", offer);
    sendOffer(roomId, offer);
  });

  socket.on("voice_answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("voice_answer", answer);
    sendAnswer(roomId, answer);
  });

  socket.on("voice_ice", ({ roomId, candidate }) => {
    socket.to(roomId).emit("voice_ice", candidate);
    sendIceCandidate(roomId, candidate);
  });
}
