const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// ============================== HOT WALLET ==============================

// GET /api/admin/hot-wallet/status
// ملاحظة مهمة: هذا يرجع آخر لقطة (snapshot) محفوظة بقاعدة البيانات فقط.
// جلب الرصيد الفعلي من على البلوكتشين مباشرة يتطلب تكامل حقيقي مع عقدة RPC ومحفظة حقيقية،
// وهذا خارج نطاق هذا الكود لأنه يتطلب مفاتيح/بنية تحتية حساسة يجب أن تُدار بعناية من طرفك.
router.get(
  '/hot-wallet/status',
  asyncHandler(async (req, res) => {
    const latest = await prisma.hotWalletSnapshot.findFirst({ orderBy: { checkedAt: 'desc' } });
    return ok(res, latest || { status: 'unknown', message: 'لا توجد بيانات بعد — يحتاج ربط فعلي بعقدة RPC' });
  })
);

// ============================== SWEEP MANAGER ==============================

// GET /api/admin/sweep-manager/history
router.get(
  '/sweep-manager/history',
  asyncHandler(async (req, res) => {
    const history = await prisma.sweepOperation.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return ok(res, history);
  })
);

// GET /api/admin/sweep-manager/readiness
router.get(
  '/sweep-manager/readiness',
  asyncHandler(async (req, res) => {
    const addresses = await prisma.treasuryAddress.findMany({ where: { isActive: true, type: 'hot' } });
    return ok(res, { ready: addresses.length > 0, hotAddressesConfigured: addresses.length });
  })
);

// GET /api/admin/sweep-manager/stats
router.get(
  '/sweep-manager/stats',
  asyncHandler(async (req, res) => {
    const [total, success, failed, pending] = await Promise.all([
      prisma.sweepOperation.count(),
      prisma.sweepOperation.count({ where: { status: 'SUCCESS' } }),
      prisma.sweepOperation.count({ where: { status: 'FAILED' } }),
      prisma.sweepOperation.count({ where: { status: 'PENDING' } }),
    ]);
    return ok(res, { total, success, failed, pending });
  })
);

// GET /api/admin/sweeps
router.get(
  '/sweeps',
  asyncHandler(async (req, res) => {
    const sweeps = await prisma.sweepOperation.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return ok(res, sweeps);
  })
);

// POST /api/admin/sweeps/run — يسجل عملية تجميع كطلب (بدون تنفيذ فعلي على السلسلة)
router.post(
  '/sweeps/run',
  validateBody(z.object({ fromAddress: z.string(), toAddress: z.string(), amount: z.number().positive(), network: z.string().default('polygon') })),
  asyncHandler(async (req, res) => {
    const sweep = await prisma.sweepOperation.create({ data: { ...req.body, triggeredBy: 'manual', status: 'PENDING' } });
    return ok(res, sweep);
  })
);

// ============================== GAS MANAGEMENT ==============================

// GET /api/admin/gas-management
router.get(
  '/gas-management',
  asyncHandler(async (req, res) => {
    let settings = await prisma.gasManagementSetting.findFirst();
    if (!settings) settings = await prisma.gasManagementSetting.create({ data: {} });
    return ok(res, settings);
  })
);

// PUT /api/admin/gas-management
router.put(
  '/gas-management',
  asyncHandler(async (req, res) => {
    let settings = await prisma.gasManagementSetting.findFirst();
    if (!settings) settings = await prisma.gasManagementSetting.create({ data: req.body });
    else settings = await prisma.gasManagementSetting.update({ where: { id: settings.id }, data: req.body });
    return ok(res, settings);
  })
);

// ============================== WALLET MOVEMENTS / DEPOSITS / WITHDRAWAL LOGS ==============================

// GET /api/admin/wallet-movements/hot-wallet
router.get(
  '/wallet-movements/hot-wallet',
  asyncHandler(async (req, res) => {
    const sweeps = await prisma.sweepOperation.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return ok(res, sweeps);
  })
);

// GET /api/admin/deposits
router.get(
  '/deposits',
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const deposits = await prisma.transaction.findMany({
      where: { type: 'DEPOSIT', ...(status ? { status } : {}) },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ok(res, deposits);
  })
);

// GET /api/admin/withdrawal-logs
router.get(
  '/withdrawal-logs',
  asyncHandler(async (req, res) => {
    const logs = await prisma.withdrawalRequest.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });
    return ok(res, logs);
  })
);

module.exports = router;
