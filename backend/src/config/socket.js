import { Server } from "socket.io";
import redis from "./redis.js";

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

  
    /* ================= REGISTER ================= */
    socket.on("register_user", async (username) => {
      socket.username = username;

      await redis.sAdd("users:all", username);
      await redis.hSet("users:online", username, socket.id);

      io.emit("users_list", await redis.sMembers("users:all"));
      io.emit("users_status", await redis.hGetAll("users:online"));
    });

    /* ================= CHAT ================= */
socket.on("private_message", async (data) => {
  const { from, to } = data;

  const msg = { ...data, time: Date.now() };
  const chatKey = `chat:${[from, to].sort().join(":")}`;

  await redis.rPush(chatKey, JSON.stringify(msg));

  //  increment unread
  const unreadCount = await redis.hIncrBy(`unread:${to}`, from, 1);

  const receiverSocket = await redis.hGet("users:online", to);
  if (receiverSocket) {
    io.to(receiverSocket).emit("receive_message", msg);

    //  SEND unread update to receiver
    io.to(receiverSocket).emit("unread_update", {
      from,
      count: unreadCount,
    });
  }

  socket.emit("receive_message", msg);
});



    /* ================= CALL START ================= */
    socket.on("call-user", async ({ to, offer }) => {
      const receiverSocket = await redis.hGet("users:online", to);
      if (!receiverSocket) return;

      const systemMsg = {
        system: true,
        text: "📞 Call started",
        from: socket.username,
        to,
        time: Date.now(),
      };

      await redis.rPush(`chat:${socket.username}:${to}`, JSON.stringify(systemMsg));
      await redis.rPush(`chat:${to}:${socket.username}`, JSON.stringify(systemMsg));

      socket.emit("receive_message", systemMsg);
      io.to(receiverSocket).emit("receive_message", systemMsg);

      io.to(receiverSocket).emit("incoming-call", {
        from: socket.username,
        offer,
      });
    });

    /* ================= CALL ANSWER ================= */
    socket.on("answer-call", async ({ to, answer }) => {
      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("call-accepted", { answer });
      }
    });

    /* ================= ICE ================= */
    socket.on("ice-candidate", async ({ to, candidate }) => {
      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("ice-candidate", { candidate });
      }
    });

    /* ================= CALL REJECT ================= */
    socket.on("reject-call", async ({ to }) => {
      const receiverSocket = await redis.hGet("users:online", to);

      const systemMsg = {
        system: true,
        text: "❌ Call rejected",
        from: socket.username,
        to,
        time: Date.now(),
      };

      await redis.rPush(`chat:${socket.username}:${to}`, JSON.stringify(systemMsg));
      await redis.rPush(`chat:${to}:${socket.username}`, JSON.stringify(systemMsg));

      socket.emit("receive_message", systemMsg);
      socket.emit("call-ended");

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", systemMsg);
        io.to(receiverSocket).emit("call-ended");
      }
    });

    socket.on("clear_unread", async ({ me, other }) => {
  await redis.hSet(`unread:${me}`, other, 0);
});


    /* ================= CALL END (CONNECTED ONLY) ================= */
    socket.on("end-call", async ({ to }) => {
      const receiverSocket = await redis.hGet("users:online", to);

      const systemMsg = {
        system: true,
        text: "❌ Call ended",
        from: socket.username,
        to,
        time: Date.now(),
      };

      await redis.rPush(`chat:${socket.username}:${to}`, JSON.stringify(systemMsg));
      await redis.rPush(`chat:${to}:${socket.username}`, JSON.stringify(systemMsg));

      socket.emit("receive_message", systemMsg);

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", systemMsg);
        io.to(receiverSocket).emit("call-ended");
      }
    });

    /* ================= MISSED CALL ================= */
    socket.on("missed-call", async ({ to }) => {
      const receiverSocket = await redis.hGet("users:online", to);

      const systemMsg = {
        system: true,
        text: "📵 Missed call",
        from: socket.username,
        to,
        time: Date.now(),
      };

      await redis.rPush(`chat:${socket.username}:${to}`, JSON.stringify(systemMsg));
      await redis.rPush(`chat:${to}:${socket.username}`, JSON.stringify(systemMsg));

      socket.emit("receive_message", systemMsg);

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", systemMsg);
      }
    });

    /* ================= CALL-ONLY CHAT (TEMP) ================= */
    socket.on("call_message", async ({ to, message, file, fileName }) => {
      const payload = {
        from: socket.username,
        message,
        file,
        fileName,
        time: Date.now(),
      };

      const receiverSocket = await redis.hGet("users:online", to);
      if (receiverSocket) {
        io.to(receiverSocket).emit("call_message", payload);
      }

      socket.emit("call_message", payload);
    });

    /* ================= DISCONNECT ================= */
    socket.on("disconnect", async () => {
      if (socket.username) {
        await redis.hDel("users:online", socket.username);
      }
      io.emit("users_status", await redis.hGetAll("users:online"));
      console.log("🔴 Disconnected:", socket.id);
    });
  });
};
