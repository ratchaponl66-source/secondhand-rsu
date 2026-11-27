const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { uploadsDir } = require('./config/uploads');
const db = require('./config/db');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required before starting the application.');
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.use(async (_req, _res, next) => {
  try {
    await db.initialize();
    next();
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', async (_req, res, next) => {
  try {
    await db.get('SELECT 1 AS ok');
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/chats', require('./routes/chatRoutes'));
app.use('/api', (_req, res) => res.status(404).json({ message: 'ไม่พบ API ที่เรียก' }));

app.use((err, _req, res, _next) => {
  console.error(err.message);
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : (err.status || 500);
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? 'ไฟล์ใหญ่เกิน 3 MB'
    : (err.expose ? err.message : 'เกิดข้อผิดพลาดในระบบ');
  res.status(status).json({ message });
});

module.exports = app;
