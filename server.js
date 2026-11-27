require('dotenv').config();
if (!process.env.JWT_SECRET) {
  console.error('ไม่พบ JWT_SECRET ในไฟล์ .env (คัดลอกจาก .env.example)');
  process.exit(1);
}

const app = require('./app');

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Secondhand RSU พร้อมใช้งานที่ http://localhost:${PORT}`));
}

module.exports = app;
