const db = require('../config/db');

const conversationForUser = `
  SELECT c.conversation_id, c.product_id, c.buyer_id, c.seller_id, p.title,
         CASE WHEN c.buyer_id = ? THEN seller.name ELSE buyer.name END AS other_user_name
  FROM conversations c
  JOIN products p ON p.product_id = c.product_id
  JOIN users buyer ON buyer.user_id = c.buyer_id
  JOIN users seller ON seller.user_id = c.seller_id
  WHERE c.conversation_id = ?
    AND (c.buyer_id = ? OR c.seller_id = ?)
`;

function getConversation(conversationId, userId) {
  return db.get(conversationForUser, [userId, conversationId, userId, userId]);
}

exports.list = async (req, res) => {
  const userId = req.user.user_id;
  const conversations = await db.all(`
    SELECT c.conversation_id, c.product_id, p.title, p.status,
           CASE WHEN c.buyer_id = ? THEN seller.name ELSE buyer.name END AS other_user_name,
           (SELECT m.body FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.message_id DESC LIMIT 1) AS last_message,
           (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.message_id DESC LIMIT 1) AS last_message_at,
           (SELECT COUNT(*) FROM messages m
            WHERE m.conversation_id = c.conversation_id AND m.sender_id != ? AND m.read_at IS NULL) AS unread_count
    FROM conversations c
    JOIN products p ON p.product_id = c.product_id
    JOIN users buyer ON buyer.user_id = c.buyer_id
    JOIN users seller ON seller.user_id = c.seller_id
    WHERE c.buyer_id = ? OR c.seller_id = ?
    ORDER BY COALESCE(
      (SELECT m.created_at FROM messages m
       WHERE m.conversation_id = c.conversation_id
       ORDER BY m.message_id DESC LIMIT 1),
      c.created_at
    ) DESC, c.conversation_id DESC
  `, [userId, userId, userId, userId]);
  res.json(conversations);
};

exports.open = async (req, res) => {
  const productId = Number(req.body?.product_id);
  if (!Number.isSafeInteger(productId) || productId <= 0)
    return res.status(400).json({ message: 'ไม่พบสินค้าที่ต้องการทักแชท' });

  const product = await db.get(`
    SELECT product_id, user_id FROM products
    WHERE product_id = ? AND is_approved = 1 AND status = 'Available'
  `, [productId]);
  if (!product) return res.status(404).json({ message: 'ไม่พบสินค้าที่เปิดให้ติดต่อ' });
  if (product.user_id === req.user.user_id)
    return res.status(403).json({ message: 'ไม่สามารถเริ่มแชทกับประกาศของตัวเองได้' });

  const result = await db.run(`
    INSERT INTO conversations (product_id, buyer_id, seller_id)
    VALUES (?, ?, ?)
    ON CONFLICT (product_id, buyer_id, seller_id) DO NOTHING
  `, [productId, req.user.user_id, product.user_id]);
  const saved = await db.get(`
    SELECT conversation_id FROM conversations
    WHERE product_id = ? AND buyer_id = ? AND seller_id = ?
  `, [productId, req.user.user_id, product.user_id]);
  const conversation = await getConversation(saved.conversation_id, req.user.user_id);
  res.status(result.changes ? 201 : 200).json(conversation);
};

exports.messages = async (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0)
    return res.status(404).json({ message: 'ไม่พบห้องแชท' });
  const conversation = await getConversation(conversationId, req.user.user_id);
  if (!conversation) return res.status(404).json({ message: 'ไม่พบห้องแชท' });

  await db.run(`
    UPDATE messages SET read_at = CAST(CURRENT_TIMESTAMP AS TEXT)
    WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL
  `, [conversationId, req.user.user_id]);
  const messages = await db.all(`
    SELECT m.message_id, m.sender_id, u.name AS sender_name, m.body, m.created_at, m.read_at,
           CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END AS is_mine
    FROM messages m
    JOIN users u ON u.user_id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.message_id
  `, [req.user.user_id, conversationId]);
  res.json({ conversation, messages });
};

exports.send = async (req, res) => {
  const conversationId = Number(req.params.id);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0)
    return res.status(404).json({ message: 'ไม่พบห้องแชท' });
  if (!body) return res.status(400).json({ message: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
  if ([...body].length > 2000) return res.status(400).json({ message: 'ข้อความต้องไม่เกิน 2,000 ตัวอักษร' });
  if (!(await getConversation(conversationId, req.user.user_id)))
    return res.status(404).json({ message: 'ไม่พบห้องแชท' });

  const inserted = await db.get(`
    INSERT INTO messages (conversation_id, sender_id, body)
    VALUES (?, ?, ?)
    RETURNING message_id
  `, [conversationId, req.user.user_id, body]);
  const message = await db.get(`
    SELECT m.message_id, m.sender_id, u.name AS sender_name, m.body, m.created_at, m.read_at
    FROM messages m JOIN users u ON u.user_id = m.sender_id
    WHERE m.message_id = ?
  `, [inserted.message_id]);
  res.status(201).json(message);
};
