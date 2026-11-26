// middleware/authMiddleware.js - ตรวจ JWT และตรวจ Role (RBAC)
const jwt = require('jsonwebtoken');

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// บังคับต้อง Login (User หรือ Admin)
function verifyToken(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { user_id, name, role }
    next();
  } catch {
    res.status(401).json({ message: 'Token ไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

// Guest ใช้ได้ และถ้ามี token ที่ถูกต้องจะใส่ req.user ให้
function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) { try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* ข้าม */ } }
  next();
}

// จำกัดสิทธิ์ตาม Role เช่น requireRole('Admin') หรือ requireRole('User','Admin')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้' });
  next();
};

const isUser = [verifyToken, requireRole('User', 'Admin')];
const isAdmin = [verifyToken, requireRole('Admin')];

module.exports = { verifyToken, optionalAuth, requireRole, isUser, isAdmin };
