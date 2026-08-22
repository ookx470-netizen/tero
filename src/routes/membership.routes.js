const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok, badRequest, notFound } = require('../utils/response');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

// GET /api/membership/plans — عام، بدون تسجيل دخول
router.get(
  '/plans',
  asyncHandler(async (req, res) => {
    const plans = await prisma.membershipPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return ok(res, plans);
  })
);

router.use(requireAuth);

// GET /api/membership — عضوية المستخدم الحالية
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const membership = await prisma.userMembership.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { purchasedAt: 'desc' },
    });
    return ok(res, membership);
  })
);

// POST /api/membership/upgrade
router.post(
  '/upgrade',
  validateBody(z.object({ planId: z.string() })),
  asyncHandler(async (req, res) => {
    const plan = await prisma.membershipPlan.findUnique({ where: { id: req.body.planId } });
    if (!plan || !plan.isActive) return notFound(res, 'خطة العضوية غير موجودة');

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (Number(wallet.balance) < Number(plan.price)) return badRequest(res, 'الرصيد غير كافٍ لشراء هذه الخطة');

    const expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({ where: { userId: req.user.id }, data: { balance: { decrement: plan.price } } });
      await tx.userMembership.updateMany({ where: { userId: req.user.id, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
      const membership = await tx.userMembership.create({
        data: { userId: req.user.id, planId: plan.id, expiresAt },
      });
      await tx.transaction.create({
        data: { userId: req.user.id, type: 'MEMBERSHIP_PURCHASE', amount: plan.price, status: 'COMPLETED', meta: { planId: plan.id } },
      });

      // عمولة إحالة مباشرة (مستوى 1) عند الشراء، إذا فيه مُحيل
      const buyer = await tx.user.findUnique({ where: { id: req.user.id } });
      if (buyer.referredById && Number(plan.referralCommissionRate) > 0) {
        const commission = (Number(plan.price) * Number(plan.referralCommissionRate)) / 100;
        if (commission > 0) {
          await tx.wallet.update({ where: { userId: buyer.referredById }, data: { balance: { increment: commission } } });
          await tx.referralCommission.create({
            data: {
              earnerId: buyer.referredById,
              sourceUserId: buyer.id,
              level: 1,
              amount: commission,
              reason: `عمولة شراء خطة عضوية: ${plan.name}`,
            },
          });
          await tx.transaction.create({
            data: { userId: buyer.referredById, type: 'REFERRAL_COMMISSION', amount: commission, status: 'COMPLETED' },
          });
        }
      }

      return membership;
    });

    return ok(res, result);
  })
);

module.exports = router;
