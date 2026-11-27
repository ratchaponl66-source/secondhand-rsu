require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const demoDbPath = process.env.DEMO_DB_PATH;
if (!demoDbPath) throw new Error('กำหนด DEMO_DB_PATH ให้ชัดเจนก่อน seed เพื่อป้องกันการแก้ฐานข้อมูลผิดไฟล์');

const adminPassword = process.env.DEMO_ADMIN_PASSWORD || '';
const userPassword = process.env.DEMO_USER_PASSWORD || '';
for (const [label, password] of [['DEMO_ADMIN_PASSWORD', adminPassword], ['DEMO_USER_PASSWORD', userPassword]]) {
  if (password.length < 14) throw new Error(`${label} ต้องมีอย่างน้อย 14 ตัวอักษร`);
}
if (adminPassword === userPassword) throw new Error('รหัสผ่าน Admin และ User ต้องไม่ซ้ำกัน');

const resolvedDbPath = path.resolve(demoDbPath);
const applicationDbPath = path.resolve(__dirname, '..', 'secondhand.db');
const samePath = process.platform === 'win32'
  ? resolvedDbPath.toLowerCase() === applicationDbPath.toLowerCase()
  : resolvedDbPath === applicationDbPath;
if (samePath) throw new Error('ใช้ไฟล์ฐานข้อมูลแยกสำหรับสาธิต ห้าม seed ทับ secondhand.db ของแอป');
fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });
const db = new Database(resolvedDbPath);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'config', 'schema.sqlite.sql'), 'utf8'));
const userColumns = db.pragma('table_info(users)');
if (!userColumns.some((column) => column.name === 'phone_public')) {
  db.exec('ALTER TABLE users ADD COLUMN phone_public INTEGER NOT NULL DEFAULT 0 CHECK (phone_public IN (0, 1))');
}

const categories = ['หนังสือ', 'อุปกรณ์ IT', 'เสื้อผ้า', 'ของใช้หอพัก'];
const account = db.prepare('SELECT user_id, role FROM users WHERE email=?');
const insertUser = db.prepare('INSERT INTO users (name,email,password_hash,phone,phone_public,role) VALUES (?,?,?,?,?,?)');
const updateUser = db.prepare('UPDATE users SET name=?,password_hash=?,phone=?,phone_public=? WHERE user_id=?');
const productByTitle = db.prepare('SELECT product_id FROM products WHERE user_id=? AND title=?');
const insertProduct = db.prepare(`
  INSERT INTO products (user_id,title,price,description,category_id,status,image_url,contact_phone,is_approved)
  VALUES (?,?,?,?,?,'Available',NULL,?,?)`);
const updateProduct = db.prepare(`
  UPDATE products
  SET price=?,description=?,category_id=?,status='Available',image_url=NULL,contact_phone=?,is_approved=?
  WHERE product_id=?`);

const fixtures = [
  {
    title: '[DEMO] หนังสือพื้นฐานฐานข้อมูล',
    price: 180,
    description: 'หนังสือสภาพดี ใช้ประกอบการเรียนวิชาฐานข้อมูล',
    category: 'หนังสือ',
    contact: 'LINE: rsu-demo-seller',
    approved: 1,
  },
  {
    title: '[DEMO] โคมไฟอ่านหนังสือ',
    price: 120,
    description: 'โคมไฟตั้งโต๊ะสำหรับหอพัก ใช้งานปกติ',
    category: 'ของใช้หอพัก',
    contact: 'LINE: rsu-demo-seller',
    approved: 0,
  },
  {
    title: '[DEMO] เมาส์ไร้สายสำหรับเรียน',
    price: 250,
    description: 'เมาส์ไร้สายพร้อมใช้งาน เหมาะกับการเรียนและทำงาน',
    category: 'อุปกรณ์ IT',
    contact: 'LINE: rsu-demo-seller',
    approved: 1,
  },
];

const seed = db.transaction(() => {
  const addCategory = db.prepare('INSERT OR IGNORE INTO categories (category_name) VALUES (?)');
  categories.forEach((name) => addCategory.run(name));

  const ensureAccount = ({ name, email, password, role, phone, phonePublic = false }) => {
    const existing = account.get(email);
    if (existing && existing.role !== role) {
      throw new Error(`ไม่สามารถ seed ${email}: บัญชีนี้มี role ${existing.role}`);
    }
    const passwordHash = bcrypt.hashSync(password, 12);
    if (existing) {
      updateUser.run(name, passwordHash, phone, phonePublic ? 1 : 0, existing.user_id);
      return existing.user_id;
    }
    return insertUser.run(name, email, passwordHash, phone, phonePublic ? 1 : 0, role).lastInsertRowid;
  };

  const adminId = ensureAccount({
    name: 'บัญชี Admin สำหรับสาธิต',
    email: 'admin@rsu.ac.th',
    password: adminPassword,
    role: 'Admin',
    phone: '0800000000',
  });
  const sellerId = ensureAccount({
    name: 'ผู้ขายตัวอย่าง RSU',
    email: 'demo.seller@rsu.ac.th',
    password: userPassword,
    role: 'User',
    phone: '0800000000',
    phonePublic: true,
  });
  const buyerId = ensureAccount({
    name: 'ผู้ซื้อสาธิต RSU',
    email: 'demo.buyer@rsu.ac.th',
    password: userPassword,
    role: 'User',
    phone: '0810000000',
  });

  const categoryId = db.prepare('SELECT category_id FROM categories WHERE category_name=?');
  const productIds = new Map();
  for (const fixture of fixtures) {
    const category = categoryId.get(fixture.category);
    if (!category) throw new Error(`ไม่พบหมวดหมู่ ${fixture.category}`);
    const existing = productByTitle.get(sellerId, fixture.title);
    if (existing) {
      updateProduct.run(
        fixture.price,
        fixture.description,
        category.category_id,
        fixture.contact,
        fixture.approved,
        existing.product_id,
      );
      productIds.set(fixture.title, existing.product_id);
    } else {
      const inserted = insertProduct.run(
        sellerId,
        fixture.title,
        fixture.price,
        fixture.description,
        category.category_id,
        fixture.contact,
        fixture.approved,
      );
      productIds.set(fixture.title, inserted.lastInsertRowid);
    }
  }

  const productId = productIds.get('[DEMO] หนังสือพื้นฐานฐานข้อมูล');
  const conversation = db.prepare(`
    INSERT OR IGNORE INTO conversations (product_id,buyer_id,seller_id) VALUES (?,?,?)
  `).run(productId, buyerId, sellerId);
  const conversationId = conversation.changes
    ? conversation.lastInsertRowid
    : db.prepare('SELECT conversation_id FROM conversations WHERE product_id=? AND buyer_id=? AND seller_id=?')
      .get(productId, buyerId, sellerId).conversation_id;
  const addSampleMessage = db.prepare(`
    INSERT INTO messages (conversation_id,sender_id,body) SELECT ?,?,?
    WHERE NOT EXISTS (
      SELECT 1 FROM messages WHERE conversation_id=? AND sender_id=? AND body=?
    )
  `);
  addSampleMessage.run(conversationId, buyerId, 'สวัสดีครับ หนังสือเล่มนี้ยังอยู่ไหมครับ?', conversationId, buyerId, 'สวัสดีครับ หนังสือเล่มนี้ยังอยู่ไหมครับ?');
  addSampleMessage.run(conversationId, sellerId, 'ยังอยู่ครับ ทักมานัดรับที่มหาวิทยาลัยได้เลยครับ', conversationId, sellerId, 'ยังอยู่ครับ ทักมานัดรับที่มหาวิทยาลัยได้เลยครับ');
  return { adminId, sellerId, buyerId };
});

const seeded = seed();
db.close();
console.log(`Demo data ready in ${resolvedDbPath}`);
console.log(`Admin: admin@rsu.ac.th (password supplied through DEMO_ADMIN_PASSWORD) [user_id=${seeded.adminId}]`);
console.log(`User: demo.seller@rsu.ac.th (password supplied through DEMO_USER_PASSWORD) [user_id=${seeded.sellerId}]`);
console.log(`Buyer: demo.buyer@rsu.ac.th (same password as DEMO_USER_PASSWORD) [user_id=${seeded.buyerId}]`);
console.log('Sample chat created between demo.buyer@rsu.ac.th and demo.seller@rsu.ac.th.');
console.log(`${fixtures.length} demo listings created or updated; approved=${fixtures.filter((item) => item.approved).length}, pending=${fixtures.filter((item) => !item.approved).length}.`);
