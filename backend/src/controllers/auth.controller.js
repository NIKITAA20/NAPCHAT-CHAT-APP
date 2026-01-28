import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "User ID required" });
  }

  const token = jwt.sign(
    { userId },
    "napchat_secret",
    { expiresIn: "7d" }
  );

  res.json({
    success: true,
    token,
    user: { userId }
  });
};
