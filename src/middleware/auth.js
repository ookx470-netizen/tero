const { verifyUserAccessToken, verifyAdminToken } = require('../utils/jwt');
const { unauthorized, forbidden } = require('../utils/response');
const prisma = require('../config/prisma');

// يتحقق من توكن المستخدم العادي (من هيدر Authorization أو من كوكي accessToken)
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.cookies?.accessToken;
    if (!token) return unauthorized(res);

    const payload = verifyUserAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return unauthorized(res, 'الحساب غير موجود');
    if (user.status === 'BANNED') return forbidden(res, 'تم حظر هذا الحساب');

    req.user = user;
    next();
  } catch (err) {
    return unauthorized(res, 'جلسة غير صالحة أو منتهية، الرجاء تسجيل الدخول مجدداً');
  }
}

// يتحقق من توكن الأدمن
async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.cookies?.adminAccessToken;
    if (!token) return unauthorized(res);

    const payload = verifyAdminToken(token);
    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin) return unauthorized(res, 'حساب الأدمن غير موجود');

    req.admin = admin;
    next();
  } catch (err) {
    return unauthorized(res, 'جلسة أدمن غير صالحة أو منتهية');
  }
}

// يحصر الوصول بأدوار معينة من الأدمن (مثلاً SUPER_ADMIN فقط)
function requireAdminRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) return unauthorized(res);
    if (!roles.includes(req.admin.role)) return forbidden(res);
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requireAdminRole };
