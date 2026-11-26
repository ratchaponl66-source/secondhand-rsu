const router = require('express').Router();
const c = require('../controllers/productController');
const upload = require('../middleware/upload');
const { optionalAuth, isUser } = require('../middleware/authMiddleware');

// Guest
router.get('/categories', c.categories);
router.get('/', c.list);
// User / Admin (/mine ต้องวางก่อน /:id)
router.get('/mine', isUser, c.mine);
router.post('/', isUser, upload.single('image'), c.create);
router.get('/:id', optionalAuth, c.get);
router.put('/:id', isUser, upload.single('image'), c.update);
router.patch('/:id/status', isUser, c.setStatus);
router.delete('/:id', isUser, c.remove);

module.exports = router;
