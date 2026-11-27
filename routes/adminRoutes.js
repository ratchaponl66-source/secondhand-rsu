const router = require('express').Router();
const c = require('../controllers/adminController');
const { isAdmin } = require('../middleware/authMiddleware');
const asyncHandler = require('../middleware/asyncHandler');

router.use(isAdmin); // ทุก route ในไฟล์นี้ใช้ได้เฉพาะ Admin

router.get('/stats', asyncHandler(c.stats));
router.get('/products', asyncHandler(c.products));
router.patch('/products/:id/approve', asyncHandler(c.approve));
router.patch('/products/:id/status', asyncHandler(c.toggleStatus));
router.delete('/products/:id', asyncHandler(c.removeProduct));

router.post('/categories', asyncHandler(c.addCategory));
router.put('/categories/:id', asyncHandler(c.updateCategory));
router.delete('/categories/:id', asyncHandler(c.removeCategory));

module.exports = router;
