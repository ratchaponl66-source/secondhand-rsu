const router = require('express').Router();
const c = require('../controllers/chatController');
const { verifyToken } = require('../middleware/authMiddleware');
const asyncHandler = require('../middleware/asyncHandler');

router.use(verifyToken);
router.get('/', asyncHandler(c.list));
router.post('/', asyncHandler(c.open));
router.get('/:id/messages', asyncHandler(c.messages));
router.post('/:id/messages', asyncHandler(c.send));

module.exports = router;
