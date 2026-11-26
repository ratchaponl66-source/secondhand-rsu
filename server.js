// server.js - จุดเริ่มต้นของแอป Secondhand RSU
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
require('./config/db'); // สร้างตาราง + seed ข้อมูล

if (!process.env.JWT_SECRET) {
  console.error('ไม่พบ JWT_SECRET ในไฟล์ .env (คัดลอกจาก .env.example)');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/chats', require('./routes/chatRoutes'));

app.use('/api', (_req, res) => res.status(404).json({ message: 'ไม่พบ API ที่เรียก' }));

// ตัวจัดการ error (รวมถึง error จาก multer)
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
    message: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกิน 3 MB' : err.message || 'เกิดข้อผิดพลาด',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secondhand RSU พร้อมใช้งานที่ http://localhost:${PORT}`));
