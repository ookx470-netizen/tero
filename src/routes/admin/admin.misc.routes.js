const router = require('express').Router();
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound, badRequest } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// ============================== MAINTENANCE ==============================

// GET /api/admin/maintenance
router.get(
  '/maintenance',
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.findUnique({ where: { key: 'maintenance_mode' } });
    return ok(res, setting?.value || { enabled: false, message: null });
  })
);

// PUT /api/admin/maintenance
router.put(
  '/maintenance',
  validateBody(z.object({ enabled: z.boolean(), message: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const setting = await prisma.siteSetting.upsert({
      where: { key: 'maintenance_mode' },
      update: { value: req.body, isPublic: true },
      create: { key: 'maintenance_mode', value: req.body, isPublic: true },
    });
    return ok(res, setting);
  })
);

// ============================== REFERRAL COMMISSION CONFIG ==============================

// GET /api/admin/referral-commission-config
router.get(
  '/referral-commission-config',
  asyncHandler(async (req, res) => {
    const config = await prisma.referralCommissionConfig.findMany({ orderBy: { level: 'asc' } });
    return ok(res, config);
  })
);

// PUT /api/admin/referral-commission-config
router.put(
  '/referral-commission-config',
  validateBody(z.object({ levels: z.array(z.object({ level: z.number().int(), percentage: z.number(), isActive: z.boolean().default(true) })) })),
  asyncHandler(async (req, res) => {
    const results = await Promise.all(
      req.body.levels.map((l) =>
        prisma.referralCommissionConfig.upsert({
          where: { level: l.level },
          update: { percentage: l.percentage, isActive: l.isActive },
          create: l,
        })
      )
    );
    return ok(res, results);
  })
);

// ============================== WALLET CHANGE REQUESTS ==============================

// GET /api/admin/wallet-change-requests
router.get(
  '/wallet-change-requests',
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const requests = await prisma.walletChangeRequest.findMany({
      where: status ? { status } : {},
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ok(res, requests);
  })
);

// GET /api/admin/wallet-change-requests/stats
router.get(
  '/wallet-change-requests/stats',
  asyncHandler(async (req, res) => {
    const [pending, approved, rejected] = await Promise.all([
      prisma.walletChangeRequest.count({ where: { status: 'PENDING' } }),
      prisma.walletChangeRequest.count({ where: { status: 'APPROVED' } }),
      prisma.walletChangeRequest.count({ where: { status: 'REJECTED' } }),
    ]);
    return ok(res, { pending, approved, rejected });
  })
);

// PUT /api/admin/wallet-change-requests/:id
router.put(
  '/wallet-change-requests/:id',
  validateBody(z.object({ status: z.enum(['APPROVED', 'REJECTED']) })),
  asyncHandler(async (req, res) => {
    const request = await prisma.walletChangeRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return notFound(res);
    if (request.status !== 'PENDING') return badRequest(res, 'تمت مراجعة هذا الطلب مسبقاً');

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.walletChangeRequest.update({
        where: { id: req.params.id },
        data: { status: req.body.status, reviewedAt: new Date(), reviewedBy: req.admin.id },
      });
      if (req.body.status === 'APPROVED') {
        await tx.user.update({ where: { id: r.userId }, data: { withdrawalWalletAddress: r.newAddress } });
      }
      return r;
    });

    return ok(res, updated);
  })
);

// ============================== CHAT AVATAR UPLOAD ==============================

const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/admin/chat/upload-avatar
router.post(
  '/chat/upload-avatar',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return badRequest(res, 'لم يتم إرفاق ملف');
    return ok(res, { url: `/uploads/avatars/${req.file.filename}` });
  })
);

module.exports = router;
