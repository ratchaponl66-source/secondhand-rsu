const router = require('express').Router();
const c = require('../controllers/chatController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.get('/', c.list);
router.post('/', c.open);
router.get('/:id/messages', c.messages);
router.post('/:id/messages', c.send);

module.exports = router;
