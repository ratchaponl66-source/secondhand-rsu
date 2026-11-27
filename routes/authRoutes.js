const router = require('express').Router();
const c = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const asyncHandler = require('../middleware/asyncHandler');

router.post('/register', asyncHandler(c.register));
router.post('/login', asyncHandler(c.login));
router.get('/me', verifyToken, asyncHandler(c.me));
router.patch('/phone-visibility', verifyToken, asyncHandler(c.updatePhoneVisibility));

module.exports = router;
