// Tiny ambient holder for the Socket.IO server instance so controllers
// (which are normally HTTP-only) can broadcast realtime updates without
// importing socket.js directly. socket.js registers the instance via
// setIO() during boot; everything else just calls getIO().

let ioInstance = null;

export const setIO = (io) => {
  ioInstance = io;
};

export const getIO = () => ioInstance;
