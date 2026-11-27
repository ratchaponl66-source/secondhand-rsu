// middleware/upload.js - อัปโหลดรูปสินค้า (jpg/png/webp ไม่เกิน 3 MB)
const multer = require('multer');

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('รองรับเฉพาะไฟล์ JPG, PNG, WEBP'), { status: 400, expose: true }));
  },
});
