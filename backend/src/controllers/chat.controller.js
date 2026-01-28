export const getChats = async (req, res) => {
  const { roomId } = req.params;

  res.json({
    roomId,
    messages: [],
    message: "Chat history will be fetched here"
  });
};
