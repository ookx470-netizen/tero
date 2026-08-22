const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, badRequest, unauthorized } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');
const { signAdminToken } = require('../../utils/jwt');
const { generateOtp } = require('../../utils/codes');

// POST /api/admin/auth/login
router.post(
  '/login',
  validateBody(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const admin = await prisma.admin.findUnique({ where: { email: req.body.email } });
    if (!admin) return unauthorized(res, 'بيانات الدخول غير صحيحة');
    const match = await bcrypt.compare(req.body.password, admin.passwordHash);
    if (!match) return unauthorized(res, 'بيانات الدخول غير صحيحة');

    const token = signAdminToken(admin);
    res.cookie('adminAccessToken', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 });
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    return ok(res, { token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
  })
);

// POST /api/admin/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    res.clearCookie('adminAccessToken');
    return ok(res, { loggedOut: true });
  })
);

// GET /api/admin/auth/me
router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const a = req.admin;
    return ok(res, { id: a.id, email: a.email, name: a.name, role: a.role, avatarUrl: a.avatarUrl });
  })
);

// POST /api/admin/auth/change-password
router.post(
  '/change-password',
  requireAdmin,
  validateBody(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const match = await bcrypt.compare(req.body.currentPassword, req.admin.passwordHash);
    if (!match) return badRequest(res, 'كلمة المرور الحالية غير صحيحة');
    const passwordHash = await bcrypt.hash(req.body.newPassword, 10);
    await prisma.admin.update({ where: { id: req.admin.id }, data: { passwordHash } });
    return ok(res, { changed: true });
  })
);

// POST /api/admin/auth/forgot-password
router.post(
  '/forgot-password',
  validateBody(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    // ملاحظة: نفس منطق المستخدم العادي، هنا فقط تأكيد الاستلام بدون كشف وجود الحساب
    return ok(res, { sent: true });
  })
);

module.exports = router;
