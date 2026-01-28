export const getUser = async (req, res) => {
  const { id } = req.params;

  res.json({
    id,
    name: "NapChat User",
    status: "online"
  });
};
