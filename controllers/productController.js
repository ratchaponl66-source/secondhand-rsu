const db = require('../config/db');
const { removeUpload, saveUpload } = require('../config/uploads');

const SELECT = `
  SELECT p.product_id, p.title, p.price, p.description, p.status, p.created_at, p.image_url,
         p.contact_phone, p.is_approved, p.user_id, p.category_id,
         u.name AS seller_name,
         CASE WHEN u.phone_public = 1 THEN u.phone ELSE NULL END AS seller_phone,
         c.category_name
  FROM products p
  JOIN users u ON u.user_id = p.user_id
  JOIN categories c ON c.category_id = p.category_id`;

const canModify = (req, product) => req.user.role === 'Admin' || product.user_id === req.user.user_id;

exports.categories = async (_req, res) =>
  res.json(await db.all('SELECT * FROM categories ORDER BY category_id'));

exports.list = async (req, res) => {
  const { q, category, status } = req.query;
  const where = ['p.is_approved = 1'];
  const params = [];
  if (q) {
    where.push('(LOWER(p.title) LIKE LOWER(?) OR LOWER(p.description) LIKE LOWER(?))');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) { where.push('p.category_id = ?'); params.push(category); }
  if (status) { where.push('p.status = ?'); params.push(status); }
  res.json(await db.all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC`, params));
};

exports.mine = async (req, res) =>
  res.json(await db.all(`${SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC`, [req.user.user_id]));

exports.get = async (req, res) => {
  const product = await db.get(`${SELECT} WHERE p.product_id = ?`, [req.params.id]);
  if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  const owner = req.user && (req.user.role === 'Admin' || req.user.user_id === product.user_id);
  if (!product.is_approved && !owner) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  res.json(product);
};

exports.create = async (req, res) => {
  const { title, price, description, category_id, contact_phone } = req.body;
  if (!title || price === undefined || !category_id)
    return res.status(400).json({ message: 'กรอกชื่อสินค้า ราคา และหมวดหมู่ให้ครบ' });
  if (isNaN(price) || Number(price) < 0) return res.status(400).json({ message: 'ราคาไม่ถูกต้อง' });
  if (!await db.get('SELECT 1 FROM categories WHERE category_id=?', [category_id]))
    return res.status(400).json({ message: 'ไม่พบหมวดหมู่ที่เลือก' });

  const isAdmin = req.user.role === 'Admin';
  const imageUrl = req.file ? await saveUpload(req.file) : null;
  try {
    const product = await db.get(`
      INSERT INTO products (user_id,title,price,description,category_id,image_url,contact_phone,is_approved)
      VALUES (?,?,?,?,?,?,?,?)
      RETURNING product_id
    `, [
      req.user.user_id, title.trim(), Number(price), description || '', category_id,
      imageUrl, contact_phone || null, isAdmin ? 1 : 0,
    ]);
    res.status(201).json({
      product_id: product.product_id,
      message: isAdmin ? 'ลงประกาศแล้ว' : 'ส่งประกาศแล้ว รอ Admin อนุมัติก่อนแสดงบนหน้าตลาด',
    });
  } catch (error) {
    if (imageUrl) await removeUpload(imageUrl);
    throw error;
  }
};

exports.update = async (req, res) => {
  const product = await db.get('SELECT * FROM products WHERE product_id=?', [req.params.id]);
  if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  if (!canModify(req, product)) return res.status(403).json({ message: 'แก้ไขได้เฉพาะประกาศของตัวเอง' });
  const { title, price, description, category_id, contact_phone } = req.body;
  if (title !== undefined && (typeof title !== 'string' || !title.trim()))
    return res.status(400).json({ message: 'ชื่อสินค้าต้องไม่เว้นว่าง' });
  if (price !== undefined && (String(price).trim() === '' || !Number.isFinite(Number(price)) || Number(price) < 0))
    return res.status(400).json({ message: 'ราคาไม่ถูกต้อง' });
  if (category_id !== undefined && !await db.get('SELECT 1 FROM categories WHERE category_id=?', [category_id]))
    return res.status(400).json({ message: 'ไม่พบหมวดหมู่ที่เลือก' });

  const imageUrl = req.file ? await saveUpload(req.file) : product.image_url;
  try {
    await db.run(`UPDATE products
      SET title=?, price=?, description=?, category_id=?, contact_phone=?, image_url=?
      WHERE product_id=?`, [
      title === undefined ? product.title : title.trim(),
      price === undefined ? product.price : Number(price),
      description ?? product.description,
      category_id ?? product.category_id,
      contact_phone ?? product.contact_phone,
      imageUrl,
      product.product_id,
    ]);
  } catch (error) {
    if (req.file && imageUrl) await removeUpload(imageUrl);
    throw error;
  }
  if (req.file && product.image_url) await removeUpload(product.image_url);
  res.json({ message: 'อัปเดตประกาศแล้ว' });
};

exports.setStatus = async (req, res) => {
  const product = await db.get('SELECT * FROM products WHERE product_id=?', [req.params.id]);
  if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  if (!canModify(req, product)) return res.status(403).json({ message: 'เปลี่ยนสถานะได้เฉพาะประกาศของตัวเอง' });
  const status = req.body.status || (product.status === 'Available' ? 'Sold' : 'Available');
  if (!['Available', 'Sold'].includes(status)) return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
  await db.run('UPDATE products SET status=? WHERE product_id=?', [status, product.product_id]);
  res.json({ status });
};

exports.remove = async (req, res) => {
  const product = await db.get('SELECT * FROM products WHERE product_id=?', [req.params.id]);
  if (!product) return res.status(404).json({ message: 'ไม่พบสินค้า' });
  if (!canModify(req, product)) return res.status(403).json({ message: 'ลบได้เฉพาะประกาศของตัวเอง' });
  await db.run('DELETE FROM products WHERE product_id=?', [product.product_id]);
  if (product.image_url) await removeUpload(product.image_url);
  res.json({ message: 'ลบประกาศแล้ว' });
};
