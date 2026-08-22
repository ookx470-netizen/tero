const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/leaders — أفضل المستخدمين حسب عدد الإحالات النشطة
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const leaders = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true, _count: { select: { referrals: true } } },
      orderBy: { referrals: { _count: 'desc' } },
      take: 50,
    });
    return ok(res, leaders);
  })
);

// GET /api/admin/leaders/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const leader = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, fullName: true, referrals: { select: { id: true, email: true } } },
    });
    if (!leader) return notFound(res);
    return ok(res, leader);
  })
);

// POST /api/admin/leaders/run-payout — تنفيذ صرف رواتب/مكافآت القادة لفترة معيّنة
router.post(
  '/run-payout',
  validateBody(z.object({ period: z.string(), payouts: z.array(z.object({ userId: z.string(), amount: z.number().positive() })) })),
  asyncHandler(async (req, res) => {
    const results = await prisma.$transaction(
      req.body.payouts.flatMap((p) => [
        prisma.leaderPayout.create({ data: { userId: p.userId, period: req.body.period, amount: p.amount, status: 'PAID', paidAt: new Date() } }),
        prisma.wallet.update({ where: { userId: p.userId }, data: { balance: { increment: p.amount } } }),
        prisma.transaction.create({ data: { userId: p.userId, type: 'LEADER_PAYOUT', amount: p.amount, status: 'COMPLETED' } }),
      ])
    );
    return ok(res, { paidCount: req.body.payouts.length });
  })
);

module.exports = router;
