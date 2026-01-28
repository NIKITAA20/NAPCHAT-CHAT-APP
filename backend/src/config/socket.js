import { Server } from "socket.io";
import redis from "./redis.js";

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "http://localhost:5173" }
  });

  io.on("connection", (socket) => {

    // 🔹 Register User
    socket.on("register_user", async (username) => {
      await redis.sAdd("users:all", username);      // all users
      await redis.hSet("users:online", username, socket.id); // online

      const allUsers = await redis.sMembers("users:all");
      io.emit("users_list", allUsers);
    });

    // 🔹 Send Message
  socket.on("private_message", async ({ from, to, message }) => {
  const msg = {
    from,
    to,
    message,
    time: Date.now(),
  };

  // Save chat
  await redis.rPush(`chat:${from}:${to}`, JSON.stringify(msg));
  await redis.rPush(`chat:${to}:${from}`, JSON.stringify(msg));

  // Increase unread count
  await redis.hIncrBy(`unread:${to}`, from, 1);

  const receiverSocket = await redis.hGet("users:online", to);

  if (receiverSocket) {
    io.to(receiverSocket).emit("receive_message", msg);

    // 🔔 Send notification event
    io.to(receiverSocket).emit("notify", {
      from,
      message,
    });
  }
});


socket.on("voice_message", async ({ from, to, audio }) => {
  const receiverSocket = await redis.hGet("users:online", to);

  const msg = {
    from,
    audio,
    type: "voice",
    time: Date.now(),
  };

  await redis.rPush(`chat:${from}:${to}`, JSON.stringify(msg));
  await redis.rPush(`chat:${to}:${from}`, JSON.stringify(msg));

  if (receiverSocket) {
    io.to(receiverSocket).emit("receive_message", msg);
  }
});


  });
};
