// دوال موحّدة لصيغة الرد حتى تكون كل نقاط الـ API متناسقة

function ok(res, data = null, meta = undefined, status = 200) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function created(res, data = null) {
  return ok(res, data, undefined, 201);
}

function fail(res, status, message, details = undefined) {
  const body = { success: false, error: { message } };
  if (details) body.error.details = details;
  return res.status(status).json(body);
}

function notFound(res, message = 'العنصر غير موجود') {
  return fail(res, 404, message);
}

function badRequest(res, message = 'طلب غير صالح', details = undefined) {
  return fail(res, 400, message, details);
}

function unauthorized(res, message = 'غير مصرح، الرجاء تسجيل الدخول') {
  return fail(res, 401, message);
}

function forbidden(res, message = 'ليس لديك صلاحية لتنفيذ هذا الإجراء') {
  return fail(res, 403, message);
}

function serverError(res, err) {
  // eslint-disable-next-line no-console
  console.error(err);
  return fail(res, 500, 'حدث خطأ داخلي بالسيرفر');
}

module.exports = { ok, created, fail, notFound, badRequest, unauthorized, forbidden, serverError };
