import express from "express";
import multer from "multer";
import path from "path";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + file.originalname;
    cb(null, unique);
  },
});

const upload = multer({ storage });

// ✅ FILE UPLOAD ROUTE
router.post("/upload", upload.single("file"), (req, res) => {
  res.json({
    fileUrl: `${process.env.BASE_URL}/uploads/${req.file.filename}`,
    fileType: req.file.mimetype,
    originalName: req.file.originalname,
  });
});

export default router;
