const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/users
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, status, page = '1', limit = '20' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const where = {
      ...(status ? { status } : {}),
      ...(search ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { fullName: { contains: search, mode: 'insensitive' } }] } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, fullName: true, status: true, emailVerified: true, honorPoints: true, createdAt: true, lastLoginAt: true },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.user.count({ where }),
    ]);

    return ok(res, items, { total, page: Number(page), limit: take });
  })
);

// GET /api/admin/users/freeze-candidates/count — مستخدمون مرشحون للتجميد (مثال: عدم دخول 30 يوم)
router.get(
  '/freeze-candidates/count',
  asyncHandler(async (req, res) => {
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const count = await prisma.user.count({ where: { status: 'ACTIVE', lastLoginAt: { lt: threshold } } });
    return ok(res, { count });
  })
);

// GET /api/admin/users/frozen-inactivity/count
router.get(
  '/frozen-inactivity/count',
  asyncHandler(async (req, res) => {
    const count = await prisma.user.count({ where: { status: 'FROZEN' } });
    return ok(res, { count });
  })
);

// GET /api/admin/users/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { wallet: true, memberships: { include: { plan: true }, orderBy: { purchasedAt: 'desc' }, take: 1 } },
    });
    if (!user) return notFound(res);
    const { passwordHash, withdrawalPasswordHash, ...safe } = user;
    return ok(res, safe);
  })
);

// PUT /api/admin/users/:id
router.put(
  '/:id',
  validateBody(
    z.object({
      fullName: z.string().optional(),
      status: z.enum(['ACTIVE', 'FROZEN', 'BANNED', 'PENDING_VERIFICATION']).optional(),
      honorPoints: z.number().int().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: req.body });
    return ok(res, user);
  })
);

// DELETE /api/admin/users/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.user.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  })
);

module.exports = router;
