require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { resolveUploadPath } = require('../config/uploads');

const demoDbPath = process.env.DEMO_DB_PATH;
if (!demoDbPath) throw new Error('กำหนด DEMO_DB_PATH ให้ชัดเจนก่อน reset เพื่อป้องกันการแก้ฐานข้อมูลผิดไฟล์');

const resolvedDbPath = path.resolve(demoDbPath);
const applicationDbPath = path.resolve(__dirname, '..', 'secondhand.db');
const samePath = process.platform === 'win32'
  ? resolvedDbPath.toLowerCase() === applicationDbPath.toLowerCase()
  : resolvedDbPath === applicationDbPath;
if (samePath) throw new Error('ใช้ไฟล์ฐานข้อมูลแยกสำหรับสาธิต ห้าม reset secondhand.db ของแอป');
if (!fs.existsSync(resolvedDbPath)) {
  console.log(`Demo database does not exist: ${resolvedDbPath}`);
  process.exit(0);
}

const db = new Database(resolvedDbPath);
const usersTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get();
if (!usersTable) {
  db.close();
  console.log('Demo data does not exist in this database.');
  process.exit(0);
}
db.pragma('foreign_keys = ON');
const reset = db.transaction(() => {
  const demoUsers = db.prepare(`
    SELECT user_id FROM users
    WHERE email IN ('demo.seller@rsu.ac.th','demo.buyer@rsu.ac.th') AND role='User'
  `).all();
  if (!demoUsers.length) return { removed: 0, images: [] };
  const userIds = demoUsers.map((user) => user.user_id);
  const placeholders = userIds.map(() => '?').join(',');
  const images = db.prepare(`
    SELECT image_url FROM products WHERE user_id IN (${placeholders}) AND image_url IS NOT NULL
  `).all(...userIds);
  const removed = db.prepare(`DELETE FROM users WHERE user_id IN (${placeholders})`).run(...userIds).changes;
  return { removed, images };
});

const result = reset();
for (const { image_url: imageUrl } of result.images) {
  const imagePath = resolveUploadPath(imageUrl);
  if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
}
db.close();
console.log(`Demo User accounts and related listings/chats removed: ${result.removed || 'nothing to remove'}`);
console.log('Demo Admin account and application categories were preserved.');
