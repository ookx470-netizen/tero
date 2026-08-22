const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, badRequest, unauthorized, notFound } = require('../utils/response');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { signUserAccessToken, signUserRefreshToken } = require('../utils/jwt');
const { generateReferralCode, generateOtp } = require('../utils/codes');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).optional(),
  referralCode: z.string().optional(), // كود إحالة الشخص اللي دعاه
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotSchema = z.object({ email: z.string().email() });
const verifyOtpSchema = z.object({ email: z.string().email(), otp: z.string().length(6) });
const resetSchema = z.object({ email: z.string().email(), otp: z.string().length(6), newPassword: z.string().min(8) });
const verifyEmailSchema = z.object({ token: z.string() });

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, { httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
}

// POST /api/auth/register
router.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, fullName, referralCode } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest(res, 'البريد الإلكتروني مستخدم مسبقاً');

    let referredById = null;
    if (referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode } });
      if (referrer) referredById = referrer.id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let myReferralCode = generateReferralCode();
    // نتأكد ما فيه تصادم بكود الإحالة (احتمال ضعيف لكن نتحسب له)
    while (await prisma.user.findUnique({ where: { referralCode: myReferralCode } })) {
      myReferralCode = generateReferralCode();
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        referralCode: myReferralCode,
        referredById,
        wallet: { create: {} },
        taskStreak: { create: {} },
      },
    });

    const verifyToken = generateOtp() + generateOtp(); // توكن 12 رقم كبديل بسيط لتوكن تحقق البريد
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token: verifyToken, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    // ملاحظة: هنا مكان إرسال إيميل التحقق الفعلي عبر SMTP (غير مفعّل افتراضياً)
    return created(res, {
      id: user.id,
      email: user.email,
      referralCode: user.referralCode,
      emailVerificationRequired: true,
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return unauthorized(res, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return unauthorized(res, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    if (user.status === 'BANNED') return unauthorized(res, 'تم حظر هذا الحساب');

    const accessToken = signUserAccessToken(user);
    const refreshToken = signUserRefreshToken(user);
    setAuthCookies(res, accessToken, refreshToken);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return ok(res, {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, referralCode: user.referralCode },
    });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    return ok(res, { loggedOut: true });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
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
      createdAt: u.createdAt,
    });
  })
);

// GET /api/auth/verify-email?token=...
router.get(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const token = req.query.token || req.body?.token;
    if (!token) return badRequest(res, 'التوكن مطلوب');

    const record = await prisma.emailVerificationToken.findUnique({ where: { token: String(token) } });
    if (!record || record.expiresAt < new Date()) return badRequest(res, 'رابط التحقق غير صالح أو منتهي');

    await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true, status: 'ACTIVE' } });
    await prisma.emailVerificationToken.delete({ where: { id: record.id } });

    return ok(res, { verified: true });
  })
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  validateBody(forgotSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    // لا نكشف إذا الإيميل موجود أو لا لأسباب أمنية
    if (user) {
      const otp = generateOtp();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, otp, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
      });
      // ملاحظة: هنا مكان إرسال الـ OTP عبر إيميل فعلي
    }
    return ok(res, { sent: true });
  })
);

// POST /api/auth/verify-reset-otp
router.post(
  '/verify-reset-otp',
  validateBody(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return badRequest(res, 'رمز التحقق غير صحيح');

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, otp, used: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) return badRequest(res, 'رمز التحقق غير صحيح أو منتهي');

    return ok(res, { valid: true });
  })
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  validateBody(resetSchema),
  asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return badRequest(res, 'رمز التحقق غير صحيح');

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, otp, used: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) return badRequest(res, 'رمز التحقق غير صحيح أو منتهي');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
    ]);

    return ok(res, { reset: true });
  })
);

module.exports = router;
