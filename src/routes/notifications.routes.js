const router = require('express').Router();
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok, notFound } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/notifications
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.notification.findMany({
      where: { OR: [{ userId: req.user.id }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const unreadCount = items.filter((n) => !n.isRead).length;
    return ok(res, items, { unreadCount });
  })
);

// POST /api/notifications/read-all
router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
    return ok(res, { updated: true });
  })
);

// PATCH /api/notifications/:id — تعليم إشعار واحد كمقروء
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n || (n.userId && n.userId !== req.user.id)) return notFound(res);
    const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    return ok(res, updated);
  })
);

// DELETE /api/notifications/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n || (n.userId && n.userId !== req.user.id)) return notFound(res);
    await prisma.notification.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  })
);

module.exports = router;
