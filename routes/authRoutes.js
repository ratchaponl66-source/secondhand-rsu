const router = require('express').Router();
const c = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/register', c.register);
router.post('/login', c.login);
router.get('/me', verifyToken, c.me);
router.patch('/phone-visibility', verifyToken, c.updatePhoneVisibility);

module.exports = router;
