export const Message = {
  id: String,
  senderId: String,
  roomId: String,
  content: String,
  type: {
    type: String,
    enum: ["text", "voice"],
    default: "text"
  },
  seen: {
    type: Boolean,
    default: false
  },
  createdAt: Date,
  expiresAt: Date
};
