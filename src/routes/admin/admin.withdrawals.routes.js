const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound, badRequest } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/withdrawals
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: status ? { status } : {},
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });
    return ok(res, withdrawals);
  })
);

// GET /api/admin/withdrawals/planning — طلبات معلّقة مجمّعة حسب الشبكة (لتخطيط التنفيذ)
router.get(
  '/planning',
  asyncHandler(async (req, res) => {
    const pending = await prisma.withdrawalRequest.findMany({ where: { status: 'PENDING' }, orderBy: { requestedAt: 'asc' } });
    return ok(res, pending);
  })
);

// GET /api/admin/withdrawals/planning/summary
router.get(
  '/planning/summary',
  asyncHandler(async (req, res) => {
    const agg = await prisma.withdrawalRequest.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: true });
    return ok(res, { totalPending: agg._count, totalAmount: agg._sum.amount || 0 });
  })
);

// GET /api/admin/withdrawals/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!withdrawal) return notFound(res);
    return ok(res, withdrawal);
  })
);

// PUT /api/admin/withdrawals/:id — موافقة/رفض/تحديث حالة
router.put(
  '/:id',
  validateBody(z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED']), adminNote: z.string().optional(), txHash: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id: req.params.id } });
    if (!withdrawal) return notFound(res);
    if (['COMPLETED', 'REJECTED', 'FAILED'].includes(withdrawal.status)) {
      return badRequest(res, 'تمت معالجة هذا الطلب مسبقاً');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawalRequest.update({
        where: { id: req.params.id },
        data: { status: req.body.status, adminNote: req.body.adminNote, txHash: req.body.txHash, processedAt: new Date(), processedBy: req.admin.id },
      });

      if (req.body.status === 'REJECTED' || req.body.status === 'FAILED') {
        // نرجع المبلغ من الرصيد المجمّد للرصيد المتاح
        await tx.wallet.update({ where: { userId: w.userId }, data: { lockedBalance: { decrement: w.amount }, balance: { increment: w.amount } } });
        await tx.transaction.updateMany({ where: { userId: w.userId, type: 'WITHDRAWAL', meta: { path: ['withdrawalRequestId'], equals: w.id } }, data: { status: 'FAILED' } });
      }
      if (req.body.status === 'COMPLETED') {
        await tx.wallet.update({ where: { userId: w.userId }, data: { lockedBalance: { decrement: w.amount } } });
        await tx.transaction.updateMany({ where: { userId: w.userId, type: 'WITHDRAWAL', meta: { path: ['withdrawalRequestId'], equals: w.id } }, data: { status: 'COMPLETED' } });
      }

      return w;
    });

    return ok(res, updated);
  })
);

module.exports = router;
