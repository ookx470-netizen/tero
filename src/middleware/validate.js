const { badRequest } = require('../utils/response');

// middleware عام: يمرر body عبر zod schema، وإذا صار خطأ يرجع 400 برسالة واضحة
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return badRequest(res, 'بيانات غير صالحة', result.error.flatten());
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
