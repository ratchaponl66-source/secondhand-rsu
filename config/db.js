// config/db.js - SQLite + สร้างตาราง/ข้อมูลเริ่มต้นอัตโนมัติ
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'secondhand.db'));
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone         TEXT,
  phone_public  INTEGER NOT NULL DEFAULT 0 CHECK (phone_public IN (0,1)),
  role          TEXT NOT NULL DEFAULT 'User' CHECK (role IN ('User','Admin'))
);
CREATE TABLE IF NOT EXISTS categories (
  category_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS products (
  product_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  price         REAL NOT NULL CHECK (price >= 0),
  description   TEXT,
  category_id   INTEGER NOT NULL REFERENCES categories(category_id),
  status        TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available','Sold')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  -- คอลัมน์เพิ่มเติมเพื่อรองรับฟอร์มลงประกาศและระบบอนุมัติของ Admin
  image_url     TEXT,
  contact_phone TEXT,
  is_approved   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  buyer_id        INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  seller_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (product_id, buyer_id, seller_id),
  CHECK (buyer_id <> seller_id)
);
CREATE TABLE IF NOT EXISTS messages (
  message_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  read_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON messages(conversation_id, created_at);
`);

const userColumns = db.pragma('table_info(users)');
if (!userColumns.some((column) => column.name === 'phone_public')) {
  db.exec('ALTER TABLE users ADD COLUMN phone_public INTEGER NOT NULL DEFAULT 0 CHECK (phone_public IN (0,1))');
}

if (db.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
  const ins = db.prepare('INSERT INTO categories (category_name) VALUES (?)');
  ['หนังสือ', 'อุปกรณ์ IT', 'เสื้อผ้า', 'ของใช้หอพัก'].forEach((n) => ins.run(n));
}

if (!db.prepare("SELECT 1 FROM users WHERE role='Admin'").get()) {
  db.prepare('INSERT INTO users (name,email,password_hash,phone,role) VALUES (?,?,?,?,?)')
    .run('Admin RSU', 'admin@rsu.ac.th', bcrypt.hashSync('Admin@1234', 10), '0800000000', 'Admin');
  console.log('[seed] สร้างบัญชี Admin เริ่มต้น admin@rsu.ac.th; เปลี่ยนรหัสผ่านก่อนใช้งานจริง');
}

module.exports = db;
