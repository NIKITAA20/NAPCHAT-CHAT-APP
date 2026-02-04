import Group from "../models/Group.js";

export default function groupSocket(io) {
  io.on("connection", (socket) => {
    console.log("👥 Group socket connected");

    socket.on("join_group", (groupId) => {
      socket.join(groupId);
    });

    socket.on("group_message", async (data) => {
      const { groupId, sender, message, file } = data;

      await Group.findByIdAndUpdate(groupId, {
        $push: {
          messages: {
            sender,
            message,
            file,
            createdAt: new Date(),
          },
        },
      });

      io.to(groupId).emit("receive_group_message", {
        groupId,
        sender,
        message,
        file,
      });
    });
  });
}
