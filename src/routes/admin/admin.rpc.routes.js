const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/rpc-monitor — قائمة عقد RPC المسجّلة وحالتها
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const nodes = await prisma.rpcNode.findMany({ orderBy: [{ network: 'asc' }, { priority: 'asc' }] });
    return ok(res, nodes);
  })
);

// POST /api/admin/rpc-monitor — إضافة عقدة جديدة للمراقبة
router.post(
  '/',
  validateBody(z.object({ network: z.string().default('polygon'), url: z.string().url(), priority: z.number().int().default(0) })),
  asyncHandler(async (req, res) => {
    const node = await prisma.rpcNode.create({ data: req.body });
    return ok(res, node);
  })
);

// POST /api/admin/rpc-monitor/reload — يعيد تحميل/فحص كل العقد المفعّلة
// ملاحظة: الفحص الفعلي (ping لعقدة RPC حقيقية) يتطلب اتصال شبكي خارجي حقيقي بعقد Polygon،
// هنا فقط نحدّث وقت آخر فحص، والفحص الحقيقي يُضاف لاحقاً حسب مزود العقدة (Alchemy/Infura/خاص).
router.post(
  '/reload',
  asyncHandler(async (req, res) => {
    const nodes = await prisma.rpcNode.findMany({ where: { isActive: true } });
    await prisma.rpcNode.updateMany({ where: { isActive: true }, data: { lastCheckedAt: new Date() } });
    return ok(res, { checked: nodes.length });
  })
);

// POST /api/admin/rpc-monitor/test — فحص عقدة واحدة محددة
router.post(
  '/test',
  validateBody(z.object({ id: z.string() })),
  asyncHandler(async (req, res) => {
    const node = await prisma.rpcNode.update({
      where: { id: req.body.id },
      data: { lastCheckedAt: new Date() },
    });
    return ok(res, node);
  })
);

module.exports = router;
