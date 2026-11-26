const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const SELECT = `
  SELECT p.product_id, p.title, p.price, p.description, p.status, p.created_at, p.image_url,
         p.contact_phone, p.is_approved, p.user_id, p.category_id,
         u.name AS seller_name,
         CASE WHEN u.phone_public = 1 THEN u.phone ELSE NULL END AS seller_phone,
         c.category_name
  FROM products p
  JOIN users u ON u.user_id = p.user_id
  JOIN categories c ON c.category_id = p.category_id`;

const canModify = (req, p) => req.user.role === 'Admin' || p.user_id === req.user.user_id;

function removeImage(url) {
  if (!url) return;
  fs.unlink(path.join(__dirname, '..', 'public', url), () => {});
}

exports.categories = (_req, res) => res.json(db.prepare('SELECT * FROM categories ORDER BY category_id').all());

// Guest: เห็นเฉพาะรายการที่ Admin อนุมัติแล้ว
exports.list = (req, res) => {
  const { q, category, status } = req.query;
  const where = ['p.is_approved = 1'];
  const params = [];
  if (q) { where.push('(p.title LIKE ? OR p.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (category) { where.push('p.category_id = ?'); params.push(category); }
  if (status) { where.push('p.status = ?'); params.push(status); }
  res.json(db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC`).all(...params));
};

exports.mine = (req, res) =>
  res.json(db.prepare(`${SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC`).all(req.user.user_id));

exports.get = (req, res) => {
  const p = db.prepare(`${SELECT} WHERE p.product_id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  const owner = req.user && (req.user.role === 'Admin' || req.user.user_id === p.user_id);
  if (!p.is_approved && !owner) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  res.json(p);
};

exports.create = (req, res) => {
  const { title, price, description, category_id, contact_phone } = req.body;
  if (!title || price === undefined || !category_id)
    return res.status(400).json({ message: 'กรอกชื่อสินค้า ราคา และหมวดหมู่ให้ครบ' });
  if (isNaN(price) || Number(price) < 0) return res.status(400).json({ message: 'ราคาไม่ถูกต้อง' });
  if (!db.prepare('SELECT 1 FROM categories WHERE category_id=?').get(category_id))
    return res.status(400).json({ message: 'ไม่พบหมวดหมู่ที่เลือก' });
  const isAdmin = req.user.role === 'Admin';
  const info = db
    .prepare(`INSERT INTO products (user_id,title,price,description,category_id,image_url,contact_phone,is_approved)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(req.user.user_id, title.trim(), Number(price), description || '', category_id,
         req.file ? '/uploads/' + req.file.filename : null, contact_phone || null, isAdmin ? 1 : 0);
  res.status(201).json({
    product_id: info.lastInsertRowid,
    message: isAdmin ? 'ลงประกาศแล้ว' : 'ส่งประกาศแล้ว รอ Admin อนุมัติก่อนแสดงบนหน้าตลาด',
  });
};

exports.update = (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE product_id=?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  if (!canModify(req, p)) return res.status(403).json({ message: 'แก้ไขได้เฉพาะประกาศของตัวเอง' });
  const { title, price, description, category_id, contact_phone } = req.body;
  if (title !== undefined && (typeof title !== 'string' || !title.trim()))
    return res.status(400).json({ message: 'ชื่อสินค้าต้องไม่เว้นว่าง' });
  if (price !== undefined && (String(price).trim() === '' || !Number.isFinite(Number(price)) || Number(price) < 0))
    return res.status(400).json({ message: 'ราคาไม่ถูกต้อง' });
  if (category_id !== undefined && !db.prepare('SELECT 1 FROM categories WHERE category_id=?').get(category_id))
    return res.status(400).json({ message: 'ไม่พบหมวดหมู่ที่เลือก' });
  const image = req.file ? '/uploads/' + req.file.filename : p.image_url;
  db.prepare(`UPDATE products SET title=?, price=?, description=?, category_id=?, contact_phone=?, image_url=?
              WHERE product_id=?`)
    .run(title === undefined ? p.title : title.trim(), price === undefined ? p.price : Number(price),
         description ?? p.description, category_id ?? p.category_id,
         contact_phone ?? p.contact_phone, image, p.product_id);
  if (req.file) removeImage(p.image_url);
  res.json({ message: 'อัปเดตประกาศแล้ว' });
};

exports.setStatus = (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE product_id=?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  if (!canModify(req, p)) return res.status(403).json({ message: 'เปลี่ยนสถานะได้เฉพาะประกาศของตัวเอง' });
  const status = req.body.status || (p.status === 'Available' ? 'Sold' : 'Available');
  if (!['Available', 'Sold'].includes(status)) return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
  db.prepare('UPDATE products SET status=? WHERE product_id=?').run(status, p.product_id);
  res.json({ status });
};

exports.remove = (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE product_id=?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  if (!canModify(req, p)) return res.status(403).json({ message: 'ลบได้เฉพาะประกาศของตัวเอง' });
  db.prepare('DELETE FROM products WHERE product_id=?').run(p.product_id);
  removeImage(p.image_url);
  res.json({ message: 'ลบประกาศแล้ว' });
};
