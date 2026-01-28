export const User = {
  id: String,
  username: String,
  email: String,
  avatar: String,
  status: {
    type: String,
    default: "offline"
  },
  createdAt: Date
};
