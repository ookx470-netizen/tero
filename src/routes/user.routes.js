const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok, badRequest, notFound } = require('../utils/response');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/user/profile
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const u = req.user;
    return ok(res, {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      avatarUrl: u.avatarUrl,
      status: u.status,
      emailVerified: u.emailVerified,
      referralCode: u.referralCode,
      honorPoints: u.honorPoints,
      withdrawalWalletAddress: u.withdrawalWalletAddress,
      createdAt: u.createdAt,
    });
  })
);

// PUT /api/user/profile
router.put(
  '/profile',
  validateBody(z.object({ fullName: z.string().min(2).max(80).optional(), avatarUrl: z.string().url().optional() })),
  asyncHandler(async (req, res) => {
    const updated = await prisma.user.update({ where: { id: req.user.id }, data: req.body });
    return ok(res, { id: updated.id, fullName: updated.fullName, avatarUrl: updated.avatarUrl });
  })
);

// ---------------------------------------------------------------------------
// تيليجرام
// ---------------------------------------------------------------------------

// GET /api/user/telegram/status
router.get(
  '/telegram/status',
  asyncHandler(async (req, res) => {
    const link = await prisma.telegramLink.findUnique({ where: { userId: req.user.id } });
    return ok(res, link || { status: 'UNLINKED' });
  })
);

// POST /api/user/telegram/link-token — يولّد توكن مؤقت يربطه المستخدم ببوت تيليجرام
router.post(
  '/telegram/link-token',
  asyncHandler(async (req, res) => {
    const token = `${req.user.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const link = await prisma.telegramLink.upsert({
      where: { userId: req.user.id },
      update: { linkToken: token, status: 'PENDING' },
      create: { userId: req.user.id, linkToken: token, status: 'PENDING' },
    });
    return ok(res, { linkToken: link.linkToken });
  })
);

// POST /api/user/telegram/request-invite
router.post(
  '/telegram/request-invite',
  asyncHandler(async (req, res) => {
    // ملاحظة: هنا مكان استدعاء بوت تيليجرام الفعلي لإرسال رابط الدعوة
    return ok(res, { requested: true });
  })
);

// ---------------------------------------------------------------------------
// كلمة مرور السحب (Withdrawal Password)
// ---------------------------------------------------------------------------

// GET /api/user/withdrawal-password/status
router.get(
  '/withdrawal-password/status',
  asyncHandler(async (req, res) => {
    return ok(res, { isSet: !!req.user.withdrawalPasswordHash });
  })
);

// POST /api/user/withdrawal-password — تعيين/تغيير كلمة مرور السحب
router.post(
  '/withdrawal-password',
  validateBody(
    z.object({
      newPassword: z.string().min(6),
      currentPassword: z.string().min(6).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { newPassword, currentPassword } = req.body;
    if (req.user.withdrawalPasswordHash) {
      if (!currentPassword) return badRequest(res, 'كلمة مرور السحب الحالية مطلوبة');
      const match = await bcrypt.compare(currentPassword, req.user.withdrawalPasswordHash);
      if (!match) return badRequest(res, 'كلمة مرور السحب الحالية غير صحيحة');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { withdrawalPasswordHash: hash } });
    return ok(res, { set: true });
  })
);

// POST /api/user/withdrawal-password/verify
router.post(
  '/withdrawal-password/verify',
  validateBody(z.object({ password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    if (!req.user.withdrawalPasswordHash) return badRequest(res, 'لم يتم تعيين كلمة مرور سحب بعد');
    const match = await bcrypt.compare(req.body.password, req.user.withdrawalPasswordHash);
    if (!match) return badRequest(res, 'كلمة المرور غير صحيحة');
    return ok(res, { valid: true });
  })
);

// ---------------------------------------------------------------------------
// محفظة السحب (Withdrawal Wallet)
// ---------------------------------------------------------------------------

// GET /api/user/withdrawal-wallet
router.get(
  '/withdrawal-wallet',
  asyncHandler(async (req, res) => {
    return ok(res, { address: req.user.withdrawalWalletAddress || null });
  })
);

// PUT /api/user/withdrawal-wallet — تعيين مباشر أول مرة (بدون طلب مراجعة) إذا ما كان محدد مسبقاً
router.put(
  '/withdrawal-wallet',
  validateBody(z.object({ address: z.string().min(10) })),
  asyncHandler(async (req, res) => {
    if (req.user.withdrawalWalletAddress) {
      return badRequest(res, 'المحفظة محددة مسبقاً، استخدم طلب تغيير المحفظة بدلاً من ذلك');
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { withdrawalWalletAddress: req.body.address } });
    return ok(res, { address: req.body.address });
  })
);

// POST /api/user/withdrawal-wallet/change-request — يحتاج مراجعة الأدمن
router.post(
  '/withdrawal-wallet/change-request',
  validateBody(z.object({ newAddress: z.string().min(10), reason: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const request = await prisma.walletChangeRequest.create({
      data: {
        userId: req.user.id,
        oldAddress: req.user.withdrawalWalletAddress,
        newAddress: req.body.newAddress,
        reason: req.body.reason,
      },
    });
    return ok(res, request);
  })
);

module.exports = router;
