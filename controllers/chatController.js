const db = require('../config/db');

const conversationForUser = db.prepare(`
  SELECT c.conversation_id, c.product_id, c.buyer_id, c.seller_id, p.title,
         CASE WHEN c.buyer_id = @userId THEN seller.name ELSE buyer.name END AS other_user_name
  FROM conversations c
  JOIN products p ON p.product_id = c.product_id
  JOIN users buyer ON buyer.user_id = c.buyer_id
  JOIN users seller ON seller.user_id = c.seller_id
  WHERE c.conversation_id = @conversationId
    AND (c.buyer_id = @userId OR c.seller_id = @userId)
`);

function getConversation(conversationId, userId) {
  return conversationForUser.get({ conversationId, userId });
}

exports.list = (req, res) => {
  const userId = req.user.user_id;
  const conversations = db.prepare(`
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
    ORDER BY COALESCE(last_message_at, c.created_at) DESC, c.conversation_id DESC
  `).all(userId, userId, userId, userId);
  res.json(conversations);
};

exports.open = (req, res) => {
  const productId = Number(req.body?.product_id);
  if (!Number.isSafeInteger(productId) || productId <= 0)
    return res.status(400).json({ message: 'ไม่พบสินค้าที่ต้องการทักแชท' });

  const product = db.prepare(`
    SELECT product_id, user_id FROM products
    WHERE product_id = ? AND is_approved = 1 AND status = 'Available'
  `).get(productId);
  if (!product) return res.status(404).json({ message: 'ไม่พบสินค้าที่เปิดให้ติดต่อ' });
  if (product.user_id === req.user.user_id)
    return res.status(403).json({ message: 'ไม่สามารถเริ่มแชทกับประกาศของตัวเองได้' });

  const result = db.prepare(`
    INSERT OR IGNORE INTO conversations (product_id, buyer_id, seller_id)
    VALUES (?, ?, ?)
  `).run(productId, req.user.user_id, product.user_id);
  const saved = db.prepare(`
    SELECT conversation_id FROM conversations
    WHERE product_id = ? AND buyer_id = ? AND seller_id = ?
  `).get(productId, req.user.user_id, product.user_id);
  const conversation = getConversation(saved.conversation_id, req.user.user_id);
  res.status(result.changes ? 201 : 200).json(conversation);
};

exports.messages = (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0)
    return res.status(404).json({ message: 'ไม่พบห้องแชท' });
  const conversation = getConversation(conversationId, req.user.user_id);
  if (!conversation) return res.status(404).json({ message: 'ไม่พบห้องแชท' });

  db.prepare(`
    UPDATE messages SET read_at = datetime('now','localtime')
    WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL
  `).run(conversationId, req.user.user_id);
  const messages = db.prepare(`
    SELECT m.message_id, m.sender_id, u.name AS sender_name, m.body, m.created_at, m.read_at,
           CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END AS is_mine
    FROM messages m
    JOIN users u ON u.user_id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.message_id
  `).all(req.user.user_id, conversationId);
  res.json({ conversation, messages });
};

exports.send = (req, res) => {
  const conversationId = Number(req.params.id);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0)
    return res.status(404).json({ message: 'ไม่พบห้องแชท' });
  if (!body) return res.status(400).json({ message: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
  if ([...body].length > 2000) return res.status(400).json({ message: 'ข้อความต้องไม่เกิน 2,000 ตัวอักษร' });
  if (!getConversation(conversationId, req.user.user_id))
    return res.status(404).json({ message: 'ไม่พบห้องแชท' });

  const result = db.prepare(`
    INSERT INTO messages (conversation_id, sender_id, body)
    VALUES (?, ?, ?)
  `).run(conversationId, req.user.user_id, body);
  const message = db.prepare(`
    SELECT m.message_id, m.sender_id, u.name AS sender_name, m.body, m.created_at, m.read_at
    FROM messages m JOIN users u ON u.user_id = m.sender_id
    WHERE m.message_id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(message);
};
