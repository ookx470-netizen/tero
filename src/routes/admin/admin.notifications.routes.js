const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// POST /api/admin/notifications/send — إرسال إشعار لمستخدم واحد أو للجميع (userId فارغ = للجميع)
router.post(
  '/send',
  validateBody(z.object({ userId: z.string().optional(), title: z.string().min(1), body: z.string().min(1), type: z.string().default('info') })),
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.create({
      data: { userId: req.body.userId || null, title: req.body.title, body: req.body.body, type: req.body.type },
    });

    const io = req.app.locals.io;
    if (io) {
      if (req.body.userId) io.to(`user:${req.body.userId}`).emit('notification', notification);
      else io.emit('notification', notification);
    }

    return ok(res, notification);
  })
);

module.exports = router;
