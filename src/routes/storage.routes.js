const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok, badRequest, notFound } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth);

// POST /api/storage — رفع ملف
router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return badRequest(res, 'لم يتم إرفاق ملف');
    const record = await prisma.storageFile.create({
      data: {
        userId: req.user.id,
        filename: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size,
        purpose: req.body.purpose || 'general',
      },
    });
    return ok(res, record);
  })
);

// GET /api/storage/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = await prisma.storageFile.findUnique({ where: { id: req.params.id } });
    if (!file) return notFound(res);
    return ok(res, file);
  })
);

module.exports = router;
