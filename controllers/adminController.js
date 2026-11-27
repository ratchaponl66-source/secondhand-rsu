const db = require('../config/db');
const { removeUpload } = require('../config/uploads');

exports.stats = async (_req, res) =>
  res.json({
    total_products: Number((await db.get('SELECT COUNT(*) AS c FROM products')).c),
    active_users: Number((await db.get("SELECT COUNT(*) AS c FROM users WHERE role='User'")).c),
    pending_approvals: Number((await db.get('SELECT COUNT(*) AS c FROM products WHERE is_approved=0')).c),
  });

exports.products = async (_req, res) =>
  res.json(await db.all(`
    SELECT p.product_id, p.title, p.price, p.status, p.is_approved, p.created_at,
           u.name AS seller_name, c.category_name
    FROM products p JOIN users u ON u.user_id=p.user_id JOIN categories c ON c.category_id=p.category_id
    ORDER BY p.is_approved ASC, p.created_at DESC`));

exports.approve = async (req, res) => {
  const result = await db.run('UPDATE products SET is_approved=1 WHERE product_id=?', [req.params.id]);
  result.changes ? res.json({ message: 'อนุมัติแล้ว' }) : res.status(404).json({ message: 'ไม่พบสินค้า' });
};

exports.toggleStatus = async (req, res) => {
  const product = await db.get('SELECT status FROM products WHERE product_id=?', [req.params.id]);
  if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  const status = product.status === 'Available' ? 'Sold' : 'Available';
  await db.run('UPDATE products SET status=? WHERE product_id=?', [status, req.params.id]);
  res.json({ status });
};

exports.removeProduct = async (req, res) => {
  const product = await db.get('SELECT image_url FROM products WHERE product_id=?', [req.params.id]);
  if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  await db.run('DELETE FROM products WHERE product_id=?', [req.params.id]);
  if (product.image_url) await removeUpload(product.image_url);
  res.json({ message: 'ลบโพสต์แล้ว' });
};

exports.addCategory = async (req, res) => {
  const name = (req.body.category_name || '').trim();
  if (!name) return res.status(400).json({ message: 'กรอกชื่อหมวดหมู่' });
  try {
    const category = await db.get(
      'INSERT INTO categories (category_name) VALUES (?) RETURNING category_id',
      [name],
    );
    res.status(201).json({ category_id: category.category_id, category_name: name });
  } catch (error) {
    if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'มีหมวดหมู่นี้แล้ว' });
    }
    throw error;
  }
};

exports.updateCategory = async (req, res) => {
  const name = (req.body.category_name || '').trim();
  if (!name) return res.status(400).json({ message: 'กรอกชื่อหมวดหมู่' });
  try {
    const result = await db.run('UPDATE categories SET category_name=? WHERE category_id=?', [name, req.params.id]);
    result.changes ? res.json({ message: 'แก้ไขแล้ว' }) : res.status(404).json({ message: 'ไม่พบหมวดหมู่' });
  } catch (error) {
    if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'มีหมวดหมู่นี้แล้ว' });
    }
    throw error;
  }
};

exports.removeCategory = async (req, res) => {
  if (await db.get('SELECT 1 FROM products WHERE category_id=?', [req.params.id]))
    return res.status(409).json({ message: 'ลบไม่ได้ เพราะยังมีสินค้าในหมวดหมู่นี้' });
  const result = await db.run('DELETE FROM categories WHERE category_id=?', [req.params.id]);
  result.changes ? res.json({ message: 'ลบหมวดหมู่แล้ว' }) : res.status(404).json({ message: 'ไม่พบหมวดหมู่' });
};
