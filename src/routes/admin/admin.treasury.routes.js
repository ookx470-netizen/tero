const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/treasury — ملخص عام (أرصدة إجمالية من المحافظ + عناوين الخزينة)
router.get(
  '/treasury',
  asyncHandler(async (req, res) => {
    const [totalUserBalance, addresses] = await Promise.all([
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.treasuryAddress.findMany({ where: { isActive: true } }),
    ]);
    return ok(res, { totalUserBalance: totalUserBalance._sum.balance || 0, addresses });
  })
);

// GET /api/admin/treasury-addresses
router.get(
  '/treasury-addresses',
  asyncHandler(async (req, res) => {
    const addresses = await prisma.treasuryAddress.findMany({ orderBy: { createdAt: 'desc' } });
    return ok(res, addresses);
  })
);

// POST /api/admin/treasury-addresses
router.post(
  '/treasury-addresses',
  validateBody(z.object({ network: z.string().default('polygon'), address: z.string().min(10), label: z.string().optional(), type: z.enum(['hot', 'cold', 'gas']).default('hot') })),
  asyncHandler(async (req, res) => {
    const addr = await prisma.treasuryAddress.create({ data: req.body });
    return ok(res, addr);
  })
);

// PUT /api/admin/treasury-addresses/:id
router.put(
  '/treasury-addresses/:id',
  asyncHandler(async (req, res) => {
    const addr = await prisma.treasuryAddress.update({ where: { id: req.params.id }, data: req.body });
    return ok(res, addr);
  })
);

// DELETE /api/admin/treasury-addresses/:id
router.delete(
  '/treasury-addresses/:id',
  asyncHandler(async (req, res) => {
    await prisma.treasuryAddress.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  })
);

// GET /api/admin/treasury-settings
router.get(
  '/treasury-settings',
  asyncHandler(async (req, res) => {
    const settings = await prisma.treasurySetting.findMany();
    return ok(res, settings);
  })
);

// PUT /api/admin/treasury-settings/:key
router.put(
  '/treasury-settings/:key',
  validateBody(z.object({ value: z.any() })),
  asyncHandler(async (req, res) => {
    const setting = await prisma.treasurySetting.upsert({
      where: { key: req.params.key },
      update: { value: req.body.value },
      create: { key: req.params.key, value: req.body.value },
    });
    return ok(res, setting);
  })
);

module.exports = router;
