export const createVoiceRoom = async (req, res) => {
  const { roomId } = req.body;

  res.json({
    success: true,
    roomId,
    message: "Voice room created"
  });
};
