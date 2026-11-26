const router = require('express').Router();
const c = require('../controllers/adminController');
const { isAdmin } = require('../middleware/authMiddleware');

router.use(isAdmin); // ทุก route ในไฟล์นี้ใช้ได้เฉพาะ Admin

router.get('/stats', c.stats);
router.get('/products', c.products);
router.patch('/products/:id/approve', c.approve);
router.patch('/products/:id/status', c.toggleStatus);
router.delete('/products/:id', c.removeProduct);

router.post('/categories', c.addCategory);
router.put('/categories/:id', c.updateCategory);
router.delete('/categories/:id', c.removeCategory);

module.exports = router;
