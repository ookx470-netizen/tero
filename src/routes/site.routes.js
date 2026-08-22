const router = require('express').Router();
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

// GET /api/finance-settings — إعدادات مالية عامة (حدود سحب/إيداع، رسوم...)
router.get(
  '/finance-settings',
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.findUnique({ where: { key: 'finance_settings' } });
    return ok(res, setting?.value || { minWithdrawal: 10, maxWithdrawal: 5000, withdrawalFeePercent: 0 });
  })
);

// GET /api/maintenance-status
router.get(
  '/maintenance-status',
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.findUnique({ where: { key: 'maintenance_mode' } });
    return ok(res, setting?.value || { enabled: false, message: null });
  })
);

// GET /api/networks/status — حالة شبكات البلوكتشين المفعّلة (مبنية على RpcNode)
router.get(
  '/networks/status',
  asyncHandler(async (req, res) => {
    const nodes = await prisma.rpcNode.findMany({ where: { isActive: true } });
    const byNetwork = {};
    for (const n of nodes) {
      if (!byNetwork[n.network]) byNetwork[n.network] = { network: n.network, status: 'HEALTHY', nodes: 0 };
      byNetwork[n.network].nodes += 1;
      if (n.status === 'DOWN') byNetwork[n.network].status = 'DOWN';
      else if (n.status === 'DEGRADED' && byNetwork[n.network].status !== 'DOWN') byNetwork[n.network].status = 'DEGRADED';
    }
    return ok(res, Object.values(byNetwork));
  })
);

// GET /api/site-settings/public/:key — إعدادات عامة يمكن لأي زائر قراءتها
router.get(
  '/site-settings/public/:key',
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.findUnique({ where: { key: req.params.key } });
    if (!setting || !setting.isPublic) return ok(res, null);
    return ok(res, setting.value);
  })
);

module.exports = router;
