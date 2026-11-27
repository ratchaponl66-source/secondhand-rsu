const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const sign = (u) =>
  jwt.sign({ user_id: u.user_id, name: u.name, role: u.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

exports.register = async (req, res) => {
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
  if (await db.get('SELECT 1 FROM users WHERE email=?', [mail]))
    return res.status(409).json({ message: 'อีเมลนี้ถูกใช้งานแล้ว' });
  const phonePublic = phonePublicInput === true || phonePublicInput === 1 || phonePublicInput === '1' || phonePublicInput === 'true';
  let inserted;
  try {
    inserted = await db.get(
      "INSERT INTO users (name,email,password_hash,phone,phone_public,role) VALUES (?,?,?,?,?,'User') RETURNING user_id",
      [name.trim(), mail, await bcrypt.hash(password, 10), normalizedPhone, phonePublic ? 1 : 0],
    );
  } catch (error) {
    if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }
    throw error;
  }
  const user = { user_id: inserted.user_id, name: name.trim(), role: 'User' };
  res.status(201).json({ token: sign(user), user });
};

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  const u = await db.get('SELECT * FROM users WHERE email=?', [(email || '').trim().toLowerCase()]);
  if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
    return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  res.json({ token: sign(u), user: { user_id: u.user_id, name: u.name, role: u.role } });
};

exports.me = async (req, res) => {
  const u = await db.get('SELECT user_id,name,email,phone,phone_public,role FROM users WHERE user_id=?', [req.user.user_id]);
  u ? res.json(u) : res.status(404).json({ message: 'ไม่พบผู้ใช้' });
};

exports.updatePhoneVisibility = async (req, res) => {
  const phonePublic = req.body?.phone_public;
  if (typeof phonePublic !== 'boolean')
    return res.status(400).json({ message: 'ค่าการแสดงเบอร์โทรไม่ถูกต้อง' });
  const result = await db.run('UPDATE users SET phone_public=? WHERE user_id=?', [phonePublic ? 1 : 0, req.user.user_id]);
  if (!result.changes) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
  res.json({ phone_public: phonePublic ? 1 : 0 });
};
