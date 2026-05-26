import fs from "fs";
import path from "path";
import { TTL_MS } from "./messageStore.js";

const UPLOADS_DIR = path.resolve("uploads");
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * Delete any file inside /uploads whose mtime is older than the
 * configured message TTL. The chat that referenced it has already
 * been pruned from Redis, so the file is now orphaned.
 */
export const sweepOldUploads = () => {
  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) return; // directory may not exist on first boot
    const cutoff = Date.now() - TTL_MS;
    let removed = 0;
    files.forEach((file) => {
      const fp = path.join(UPLOADS_DIR, file);
      fs.stat(fp, (statErr, stat) => {
        if (statErr || !stat || !stat.isFile()) return;
        if (stat.mtimeMs < cutoff) {
          fs.unlink(fp, (uErr) => {
            if (!uErr) removed += 1;
          });
        }
      });
    });
    if (removed) console.log(`🧹 Swept ${removed} expired upload(s)`);
  });
};

export const startUploadsCleanup = () => {
  sweepOldUploads();
  setInterval(sweepOldUploads, SWEEP_INTERVAL_MS);
};
