const { fail } = require('../utils/response');

function notFoundHandler(req, res) {
  return fail(res, 404, `المسار غير موجود: ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err?.code === 'P2002') {
    // Prisma unique constraint violation
    return fail(res, 409, 'القيمة مستخدمة مسبقاً', { fields: err.meta?.target });
  }
  if (err?.code === 'P2025') {
    return fail(res, 404, 'العنصر غير موجود');
  }
  if (err?.name === 'ZodError') {
    return fail(res, 400, 'بيانات غير صالحة', err.errors);
  }

  const status = err.status || 500;
  return fail(res, status, err.message || 'حدث خطأ داخلي بالسيرفر');
}

module.exports = { notFoundHandler, errorHandler };
