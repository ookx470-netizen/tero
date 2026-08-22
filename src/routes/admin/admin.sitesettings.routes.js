const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/site-settings
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await prisma.siteSetting.findMany();
    return ok(res, settings);
  })
);

// POST /api/admin/site-settings — إنشاء/تحديث إعداد
router.post(
  '/',
  validateBody(z.object({ key: z.string().min(1), value: z.any(), isPublic: z.boolean().default(false) })),
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.upsert({
      where: { key: req.body.key },
      update: { value: req.body.value, isPublic: req.body.isPublic },
      create: req.body,
    });
    return ok(res, setting);
  })
);

// GET /api/admin/site-settings/emergency_withdrawal_mode
router.get(
  '/emergency_withdrawal_mode',
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.findUnique({ where: { key: 'emergency_withdrawal_mode' } });
    return ok(res, setting?.value || { enabled: false });
  })
);

// PUT /api/admin/site-settings/emergency_withdrawal_mode
router.put(
  '/emergency_withdrawal_mode',
  validateBody(z.object({ enabled: z.boolean(), reason: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.upsert({
      where: { key: 'emergency_withdrawal_mode' },
      update: { value: req.body, isPublic: true },
      create: { key: 'emergency_withdrawal_mode', value: req.body, isPublic: true },
    });
    return ok(res, setting);
  })
);

// GET /api/admin/site-settings/:key
router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.findUnique({ where: { key: req.params.key } });
    if (!setting) return notFound(res);
    return ok(res, setting);
  })
);

// PUT /api/admin/site-settings/:key
router.put(
  '/:key',
  validateBody(z.object({ value: z.any(), isPublic: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.upsert({
      where: { key: req.params.key },
      update: { value: req.body.value, ...(req.body.isPublic !== undefined ? { isPublic: req.body.isPublic } : {}) },
      create: { key: req.params.key, value: req.body.value, isPublic: req.body.isPublic || false },
    });
    return ok(res, setting);
  })
);

// DELETE /api/admin/site-settings/:key
router.delete(
  '/:key',
  asyncHandler(async (req, res) => {
    await prisma.siteSetting.delete({ where: { key: req.params.key } });
    return ok(res, { deleted: true });
  })
);

module.exports = router;
