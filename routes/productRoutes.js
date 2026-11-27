const router = require('express').Router();
const c = require('../controllers/productController');
const upload = require('../middleware/upload');
const { optionalAuth, isUser } = require('../middleware/authMiddleware');
const asyncHandler = require('../middleware/asyncHandler');

// Guest
router.get('/categories', asyncHandler(c.categories));
router.get('/', asyncHandler(c.list));
// User / Admin (/mine ต้องวางก่อน /:id)
router.get('/mine', isUser, asyncHandler(c.mine));
router.post('/', isUser, upload.single('image'), asyncHandler(c.create));
router.get('/:id', optionalAuth, asyncHandler(c.get));
router.put('/:id', isUser, upload.single('image'), asyncHandler(c.update));
router.patch('/:id/status', isUser, asyncHandler(c.setStatus));
router.delete('/:id', isUser, asyncHandler(c.remove));

module.exports = router;
