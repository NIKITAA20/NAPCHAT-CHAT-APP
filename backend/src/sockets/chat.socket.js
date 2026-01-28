const users = {};

export default function chatSocket(io, socket) {

  // Register user
  socket.on("register_user", (username) => {
    users[username] = socket.id;
    console.log("User registered:", username);

    // Send updated user list
    io.emit("users_list", Object.keys(users));
  });

  // Private message
  socket.on("private_message", ({ from, to, message }) => {
    const targetSocket = users[to];

    if (targetSocket) {
      io.to(targetSocket).emit("receive_message", {
        from,
        message,
      });
    }
  });

  socket.on("disconnect", () => {
    for (let user in users) {
      if (users[user] === socket.id) {
        delete users[user];
      }
    }

    io.emit("users_list", Object.keys(users));
    console.log("User disconnected");
  });
}
