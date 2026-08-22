const router = require('express').Router();
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/referrals — قائمة المُحالين المباشرين
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const referrals = await prisma.user.findMany({
      where: { referredById: req.user.id },
      select: { id: true, fullName: true, email: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, referrals);
  })
);

// GET /api/referrals/stats
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [totalReferrals, activeReferrals, totalEarned] = await Promise.all([
      prisma.user.count({ where: { referredById: req.user.id } }),
      prisma.user.count({ where: { referredById: req.user.id, status: 'ACTIVE' } }),
      prisma.referralCommission.aggregate({ where: { earnerId: req.user.id }, _sum: { amount: true } }),
    ]);
    return ok(res, {
      totalReferrals,
      activeReferrals,
      totalEarned: totalEarned._sum.amount || 0,
      referralCode: req.user.referralCode,
    });
  })
);

// GET /api/referrals/salary-history
router.get(
  '/salary-history',
  asyncHandler(async (req, res) => {
    const history = await prisma.leaderPayout.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ok(res, history);
  })
);

module.exports = router;
