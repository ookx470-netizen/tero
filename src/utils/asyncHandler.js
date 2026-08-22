// يلف أي async controller حتى ينتقل الخطأ تلقائياً لـ errorHandler بدل ما ال process يطيح
module.exports = function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
