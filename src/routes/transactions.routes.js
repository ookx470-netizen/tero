const router = require('express').Router();
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/transactions — مع فلترة اختيارية بالنوع والحالة وترقيم صفحات
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { type, status, page = '1', limit = '20' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const where = { userId: req.user.id, ...(type ? { type } : {}), ...(status ? { status } : {}) };

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.transaction.count({ where }),
    ]);

    return ok(res, items, { total, page: Number(page), limit: take });
  })
);

module.exports = router;
