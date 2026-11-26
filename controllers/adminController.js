const fs = require('fs');
const path = require('path');
const db = require('../config/db');

exports.stats = (_req, res) =>
  res.json({
    total_products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    active_users: db.prepare("SELECT COUNT(*) c FROM users WHERE role='User'").get().c,
    pending_approvals: db.prepare('SELECT COUNT(*) c FROM products WHERE is_approved=0').get().c,
  });

exports.products = (_req, res) =>
  res.json(db.prepare(`
    SELECT p.product_id, p.title, p.price, p.status, p.is_approved, p.created_at,
           u.name AS seller_name, c.category_name
    FROM products p JOIN users u ON u.user_id=p.user_id JOIN categories c ON c.category_id=p.category_id
    ORDER BY p.is_approved ASC, p.created_at DESC`).all());

exports.approve = (req, res) => {
  const r = db.prepare('UPDATE products SET is_approved=1 WHERE product_id=?').run(req.params.id);
  r.changes ? res.json({ message: 'อนุมัติแล้ว' }) : res.status(404).json({ message: 'ไม่พบสินค้า' });
};

exports.toggleStatus = (req, res) => {
  const p = db.prepare('SELECT status FROM products WHERE product_id=?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  const status = p.status === 'Available' ? 'Sold' : 'Available';
  db.prepare('UPDATE products SET status=? WHERE product_id=?').run(status, req.params.id);
  res.json({ status });
};

exports.removeProduct = (req, res) => {
  const p = db.prepare('SELECT image_url FROM products WHERE product_id=?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  db.prepare('DELETE FROM products WHERE product_id=?').run(req.params.id);
  if (p.image_url) fs.unlink(path.join(__dirname, '..', 'public', p.image_url), () => {});
  res.json({ message: 'ลบโพสต์แล้ว' });
};

exports.addCategory = (req, res) => {
  const name = (req.body.category_name || '').trim();
  if (!name) return res.status(400).json({ message: 'กรอกชื่อหมวดหมู่' });
  try {
    const i = db.prepare('INSERT INTO categories (category_name) VALUES (?)').run(name);
    res.status(201).json({ category_id: i.lastInsertRowid, category_name: name });
  } catch { res.status(409).json({ message: 'มีหมวดหมู่นี้แล้ว' }); }
};

exports.updateCategory = (req, res) => {
  const name = (req.body.category_name || '').trim();
  if (!name) return res.status(400).json({ message: 'กรอกชื่อหมวดหมู่' });
  try {
    const r = db.prepare('UPDATE categories SET category_name=? WHERE category_id=?').run(name, req.params.id);
    r.changes ? res.json({ message: 'แก้ไขแล้ว' }) : res.status(404).json({ message: 'ไม่พบหมวดหมู่' });
  } catch { res.status(409).json({ message: 'มีหมวดหมู่นี้แล้ว' }); }
};

exports.removeCategory = (req, res) => {
  if (db.prepare('SELECT 1 FROM products WHERE category_id=?').get(req.params.id))
    return res.status(409).json({ message: 'ลบไม่ได้ เพราะยังมีสินค้าในหมวดหมู่นี้' });
  const r = db.prepare('DELETE FROM categories WHERE category_id=?').run(req.params.id);
  r.changes ? res.json({ message: 'ลบหมวดหมู่แล้ว' }) : res.status(404).json({ message: 'ไม่พบหมวดหมู่' });
};
