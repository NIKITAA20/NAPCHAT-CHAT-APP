import express from "express";
import multer from "multer";

const router = express.Router();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

router.post("/upload", upload.single("file"), (req, res) => {
  // ✅ FIX: Build URL from request — no env variable needed, never undefined
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const baseUrl = `${protocol}://${host}`;

  res.json({
    fileUrl: `${baseUrl}/uploads/${req.file.filename}`,
    fileType: req.file.mimetype,
    originalName: req.file.originalname,
  });
});

export default router;