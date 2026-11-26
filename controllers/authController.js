const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const sign = (u) =>
  jwt.sign({ user_id: u.user_id, name: u.name, role: u.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

exports.register = (req, res) => {
  const { name, email, password, phone, phone_public: phonePublicInput } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || typeof password !== 'string' || !password)
    return res.status(400).json({ message: 'กรอกชื่อ อีเมล และรหัสผ่านให้ครบ' });
  if (password.length < 8) return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  const mail = email.trim().toLowerCase();
  if (!/^[^\s@]+@rsu\.ac\.th$/.test(mail))
    return res.status(400).json({ message: 'กรุณาใช้อีเมลมหาวิทยาลัยที่ลงท้ายด้วย @rsu.ac.th เท่านั้น' });
  if (typeof phone !== 'string' || !phone.trim())
    return res.status(400).json({ message: 'กรุณากรอกเบอร์โทรศัพท์' });
  const compactPhone = phone.trim().replace(/[\s().-]/g, '');
  const normalizedPhone = /^\+66\d{8,9}$/.test(compactPhone)
    ? `0${compactPhone.slice(3)}`
    : compactPhone;
  if (!/^0\d{8,9}$/.test(normalizedPhone))
    return res.status(400).json({ message: 'รูปแบบเบอร์โทรไม่ถูกต้อง กรุณากรอกเบอร์ไทย 9–10 หลัก เช่น 0812345678' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(mail))
    return res.status(409).json({ message: 'อีเมลนี้ถูกใช้งานแล้ว' });
  const phonePublic = phonePublicInput === true || phonePublicInput === 1 || phonePublicInput === '1' || phonePublicInput === 'true';
  const info = db
    .prepare("INSERT INTO users (name,email,password_hash,phone,phone_public,role) VALUES (?,?,?,?,?,'User')")
    .run(name.trim(), mail, bcrypt.hashSync(password, 10), normalizedPhone, phonePublic ? 1 : 0);
  const user = { user_id: info.lastInsertRowid, name: name.trim(), role: 'User' };
  res.status(201).json({ token: sign(user), user });
};

exports.login = (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  res.json({ token: sign(u), user: { user_id: u.user_id, name: u.name, role: u.role } });
};

exports.me = (req, res) => {
  const u = db.prepare('SELECT user_id,name,email,phone,phone_public,role FROM users WHERE user_id=?').get(req.user.user_id);
  u ? res.json(u) : res.status(404).json({ message: 'ไม่พบผู้ใช้' });
};

exports.updatePhoneVisibility = (req, res) => {
  const phonePublic = req.body?.phone_public;
  if (typeof phonePublic !== 'boolean')
    return res.status(400).json({ message: 'ค่าการแสดงเบอร์โทรไม่ถูกต้อง' });
  const result = db.prepare('UPDATE users SET phone_public=? WHERE user_id=?')
    .run(phonePublic ? 1 : 0, req.user.user_id);
  if (!result.changes) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
  res.json({ phone_public: phonePublic ? 1 : 0 });
};
