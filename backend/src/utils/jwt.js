import jwt from "jsonwebtoken";

const JWT_SECRET = "napchat_secret_key";

// Generate Token
export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d"
  });
};

// Verify Token
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};
