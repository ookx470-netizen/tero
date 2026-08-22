const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/honor-points
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req.query;
    const entries = await prisma.honorPointEntry.findMany({
      where: userId ? { userId } : {},
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ok(res, entries);
  })
);

// POST /api/admin/honor-points — منح/خصم نقاط شرف
router.post(
  '/',
  validateBody(z.object({ userId: z.string(), points: z.number().int(), reason: z.string().min(2) })),
  asyncHandler(async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.honorPointEntry.create({ data: req.body });
      const user = await tx.user.update({ where: { id: req.body.userId }, data: { honorPoints: { increment: req.body.points } } });
      return { entry, honorPoints: user.honorPoints };
    });
    return ok(res, result);
  })
);

// GET /api/admin/honor-points/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const entry = await prisma.honorPointEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return notFound(res);
    return ok(res, entry);
  })
);

// DELETE /api/admin/honor-points/:id — إلغاء إدخال (ويعكس أثره على رصيد النقاط)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const entry = await prisma.honorPointEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return notFound(res);
    await prisma.$transaction([
      prisma.user.update({ where: { id: entry.userId }, data: { honorPoints: { decrement: entry.points } } }),
      prisma.honorPointEntry.delete({ where: { id: entry.id } }),
    ]);
    return ok(res, { deleted: true });
  })
);

module.exports = router;
