const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/membership-plans
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const plans = await prisma.membershipPlan.findMany({ orderBy: { sortOrder: 'asc' } });
    return ok(res, plans);
  })
);

// POST /api/admin/membership-plans
router.post(
  '/',
  validateBody(
    z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      price: z.number().nonnegative(),
      durationDays: z.number().int().positive(),
      dailyProfitRate: z.number().default(0),
      referralCommissionRate: z.number().default(0),
      benefits: z.any().optional(),
      sortOrder: z.number().int().default(0),
    })
  ),
  asyncHandler(async (req, res) => {
    const plan = await prisma.membershipPlan.create({ data: req.body });
    return ok(res, plan);
  })
);

// GET /api/admin/membership-plans/distribution — عدد المستخدمين لكل خطة
router.get(
  '/distribution',
  asyncHandler(async (req, res) => {
    const plans = await prisma.membershipPlan.findMany();
    const distribution = await Promise.all(
      plans.map(async (plan) => ({
        planId: plan.id,
        name: plan.name,
        activeUsers: await prisma.userMembership.count({ where: { planId: plan.id, status: 'ACTIVE' } }),
      }))
    );
    return ok(res, distribution);
  })
);

// POST /api/admin/membership-plans/sync — مزامنة placeholder (لأي تكامل خارجي مستقبلي)
router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const plans = await prisma.membershipPlan.findMany();
    return ok(res, { synced: plans.length });
  })
);

// GET /api/admin/membership-plans/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const plan = await prisma.membershipPlan.findUnique({ where: { id: req.params.id } });
    if (!plan) return notFound(res);
    return ok(res, plan);
  })
);

// PUT /api/admin/membership-plans/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const plan = await prisma.membershipPlan.update({ where: { id: req.params.id }, data: req.body });
    return ok(res, plan);
  })
);

// DELETE /api/admin/membership-plans/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.membershipPlan.update({ where: { id: req.params.id }, data: { isActive: false } });
    return ok(res, { deactivated: true });
  })
);

module.exports = router;
