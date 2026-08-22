const router = require('express').Router();
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok, badRequest, forbidden } = require('../utils/response');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/wallet/balance
router.get(
  '/balance',
  asyncHandler(async (req, res) => {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    return ok(res, wallet);
  })
);

// GET /api/wallet/deposit-address — إذا ما مولّد بعد ننشئ عنوان placeholder
// ملاحظة مهمة: توليد عنوان إيداع حقيقي على Polygon يتطلب تكامل فعلي مع محفظة HD/عقدة RPC،
// هذا غير متوفر هنا لأنه يحتاج مفاتيح خاصة حساسة يجب أن تُدار خارج هذا الكود مباشرة.
router.get(
  '/deposit-address',
  asyncHandler(async (req, res) => {
    let wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet.depositAddress) {
      const placeholder = `0xPENDING_${req.user.id.replace(/-/g, '').slice(0, 34)}`;
      wallet = await prisma.wallet.update({ where: { userId: req.user.id }, data: { depositAddress: placeholder } });
    }
    return ok(res, { address: wallet.depositAddress, network: wallet.network });
  })
);

// POST /api/wallet/withdraw
router.post(
  '/withdraw',
  validateBody(
    z.object({
      amount: z.number().positive(),
      walletAddress: z.string().min(10).optional(),
      withdrawalPassword: z.string().min(1),
    })
  ),
  asyncHandler(async (req, res) => {
    const { amount, walletAddress, withdrawalPassword } = req.body;
    const user = req.user;

    if (!user.withdrawalPasswordHash) return badRequest(res, 'الرجاء تعيين كلمة مرور السحب أولاً');
    const match = await bcrypt.compare(withdrawalPassword, user.withdrawalPasswordHash);
    if (!match) return forbidden(res, 'كلمة مرور السحب غير صحيحة');

    const address = walletAddress || user.withdrawalWalletAddress;
    if (!address) return badRequest(res, 'لا توجد محفظة سحب محددة');

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (Number(wallet.balance) < amount) return badRequest(res, 'الرصيد غير كافٍ');

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId: user.id },
        data: { balance: { decrement: amount }, lockedBalance: { increment: amount } },
      });
      const withdrawal = await tx.withdrawalRequest.create({
        data: { userId: user.id, amount, walletAddress: address },
      });
      await tx.transaction.create({
        data: { userId: user.id, type: 'WITHDRAWAL', amount, status: 'PENDING', meta: { withdrawalRequestId: withdrawal.id } },
      });
      return withdrawal;
    });

    return ok(res, result);
  })
);

module.exports = router;
