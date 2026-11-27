require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function seed() {
  if (!process.env.DEMO_DATABASE_URL) throw new Error('กำหนด DEMO_DATABASE_URL สำหรับฐานข้อมูลเดโมโดยเฉพาะ');
  if (process.env.DEMO_SEED_CONFIRMATION !== 'YES') {
    throw new Error('ตั้ง DEMO_SEED_CONFIRMATION=YES เพื่อยืนยันว่า DEMO_DATABASE_URL เป็นฐานข้อมูลเดโมที่ตั้งใจเลือก');
  }

  const adminPassword = process.env.DEMO_ADMIN_PASSWORD || '';
  const userPassword = process.env.DEMO_USER_PASSWORD || '';
  for (const [label, password] of [['DEMO_ADMIN_PASSWORD', adminPassword], ['DEMO_USER_PASSWORD', userPassword]]) {
    if (password.length < 14) throw new Error(`${label} ต้องมีอย่างน้อย 14 ตัวอักษร`);
  }
  if (adminPassword === userPassword) throw new Error('รหัสผ่าน Admin และ User ต้องไม่ซ้ำกัน');

  const pool = new Pool({
    connectionString: process.env.DEMO_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'config', 'schema.postgres.sql'), 'utf8');
    for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
      await client.query(statement);
    }

    await client.query('BEGIN');
    for (const category of ['หนังสือ', 'อุปกรณ์ IT', 'เสื้อผ้า', 'ของใช้หอพัก']) {
      await client.query(
        'INSERT INTO categories (category_name) VALUES ($1) ON CONFLICT (category_name) DO NOTHING',
        [category],
      );
    }

    async function ensureUser({ name, email, password, role, phone, phonePublic = false }) {
      const existing = (await client.query('SELECT user_id, role FROM users WHERE email=$1', [email])).rows[0];
      if (existing && existing.role !== role) {
        throw new Error(`ไม่สามารถ seed ${email}: บัญชีนี้มี role ${existing.role}`);
      }
      const passwordHash = await bcrypt.hash(password, 12);
      if (existing) {
        await client.query(
          'UPDATE users SET name=$1,password_hash=$2,phone=$3,phone_public=$4 WHERE user_id=$5',
          [name, passwordHash, phone, phonePublic ? 1 : 0, existing.user_id],
        );
        return existing.user_id;
      }
      const inserted = await client.query(
        'INSERT INTO users (name,email,password_hash,phone,phone_public,role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING user_id',
        [name, email, passwordHash, phone, phonePublic ? 1 : 0, role],
      );
      return inserted.rows[0].user_id;
    }

    const adminId = await ensureUser({
      name: 'บัญชี Admin สำหรับสาธิต',
      email: 'admin@rsu.ac.th',
      password: adminPassword,
      role: 'Admin',
      phone: '0800000000',
    });
    const sellerId = await ensureUser({
      name: 'ผู้ขายตัวอย่าง RSU',
      email: 'demo.seller@rsu.ac.th',
      password: userPassword,
      role: 'User',
      phone: '0800000000',
      phonePublic: true,
    });
    const buyerId = await ensureUser({
      name: 'ผู้ซื้อสาธิต RSU',
      email: 'demo.buyer@rsu.ac.th',
      password: userPassword,
      role: 'User',
      phone: '0810000000',
    });

    const fixtures = [
      { title: '[DEMO] หนังสือพื้นฐานฐานข้อมูล', price: 180, description: 'หนังสือสภาพดี ใช้ประกอบการเรียนวิชาฐานข้อมูล', category: 'หนังสือ', approved: 1 },
      { title: '[DEMO] โคมไฟอ่านหนังสือ', price: 120, description: 'โคมไฟตั้งโต๊ะสำหรับหอพัก ใช้งานปกติ', category: 'ของใช้หอพัก', approved: 0 },
      { title: '[DEMO] เมาส์ไร้สายสำหรับเรียน', price: 250, description: 'เมาส์ไร้สายพร้อมใช้งาน เหมาะกับการเรียนและทำงาน', category: 'อุปกรณ์ IT', approved: 1 },
    ];
    const productIds = new Map();
    for (const fixture of fixtures) {
      const category = (await client.query(
        'SELECT category_id FROM categories WHERE category_name=$1',
        [fixture.category],
      )).rows[0];
      if (!category) throw new Error(`ไม่พบหมวดหมู่ ${fixture.category}`);

      const existing = (await client.query(
        'SELECT product_id FROM products WHERE user_id=$1 AND title=$2',
        [sellerId, fixture.title],
      )).rows[0];
      if (existing) {
        await client.query(`UPDATE products
          SET price=$1,description=$2,category_id=$3,status='Available',image_url=NULL,
              contact_phone=$4,is_approved=$5
          WHERE product_id=$6`, [
          fixture.price, fixture.description, category.category_id,
          'LINE: rsu-demo-seller', fixture.approved, existing.product_id,
        ]);
        productIds.set(fixture.title, existing.product_id);
      } else {
        const inserted = await client.query(`INSERT INTO products
          (user_id,title,price,description,category_id,status,image_url,contact_phone,is_approved)
          VALUES ($1,$2,$3,$4,$5,'Available',NULL,$6,$7) RETURNING product_id`, [
          sellerId, fixture.title, fixture.price, fixture.description, category.category_id,
          'LINE: rsu-demo-seller', fixture.approved,
        ]);
        productIds.set(fixture.title, inserted.rows[0].product_id);
      }
    }

    const productId = productIds.get('[DEMO] หนังสือพื้นฐานฐานข้อมูล');
    await client.query(`INSERT INTO conversations (product_id,buyer_id,seller_id)
      VALUES ($1,$2,$3) ON CONFLICT (product_id,buyer_id,seller_id) DO NOTHING`, [productId, buyerId, sellerId]);
    const conversation = (await client.query(
      'SELECT conversation_id FROM conversations WHERE product_id=$1 AND buyer_id=$2 AND seller_id=$3',
      [productId, buyerId, sellerId],
    )).rows[0];
    for (const [senderId, body] of [
      [buyerId, 'สวัสดีครับ หนังสือเล่มนี้ยังอยู่ไหมครับ?'],
      [sellerId, 'ยังอยู่ครับ ทักมานัดรับที่มหาวิทยาลัยได้เลยครับ'],
    ]) {
      await client.query(`INSERT INTO messages (conversation_id,sender_id,body)
        SELECT $1,$2,$3 WHERE NOT EXISTS (
          SELECT 1 FROM messages WHERE conversation_id=$1 AND sender_id=$2 AND body=$3
        )`, [conversation.conversation_id, senderId, body]);
    }

    await client.query('COMMIT');
    console.log('Cloud demo data created or updated successfully.');
    console.log('Demo logins: admin@rsu.ac.th, demo.seller@rsu.ac.th, demo.buyer@rsu.ac.th.');
    console.log('Passwords are supplied through DEMO_ADMIN_PASSWORD and DEMO_USER_PASSWORD.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
