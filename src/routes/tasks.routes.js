const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok, badRequest, notFound } = require('../utils/response');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/tasks — مهام الأسبوع الحالي (الأحدث)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const latest = await prisma.task.findFirst({ where: { status: 'ACTIVE' }, orderBy: { weekNumber: 'desc' } });
    const weekNumber = req.query.week ? Number(req.query.week) : latest?.weekNumber;
    const tasks = weekNumber
      ? await prisma.task.findMany({ where: { weekNumber, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
      : [];

    const submissions = await prisma.taskSubmission.findMany({
      where: { userId: req.user.id, taskId: { in: tasks.map((t) => t.id) } },
    });
    const submissionByTask = Object.fromEntries(submissions.map((s) => [s.taskId, s]));

    return ok(
      res,
      tasks.map((t) => ({ ...t, mySubmission: submissionByTask[t.id] || null })),
      { weekNumber }
    );
  })
);

// GET /api/tasks/streak
router.get(
  '/streak',
  asyncHandler(async (req, res) => {
    const streak = await prisma.taskStreak.findUnique({ where: { userId: req.user.id } });
    return ok(res, streak || { currentStreak: 0, longestStreak: 0, lastCompletedAt: null });
  })
);

// GET /api/tasks/summary
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const [total, approved, pending, rejected] = await Promise.all([
      prisma.taskSubmission.count({ where: { userId: req.user.id } }),
      prisma.taskSubmission.count({ where: { userId: req.user.id, status: 'APPROVED' } }),
      prisma.taskSubmission.count({ where: { userId: req.user.id, status: 'PENDING' } }),
      prisma.taskSubmission.count({ where: { userId: req.user.id, status: 'REJECTED' } }),
    ]);
    return ok(res, { total, approved, pending, rejected });
  })
);

// POST /api/tasks/validate-access-code
router.post(
  '/validate-access-code',
  validateBody(z.object({ code: z.string().min(4) })),
  asyncHandler(async (req, res) => {
    const record = await prisma.taskAccessCode.findUnique({ where: { code: req.body.code.toUpperCase() } });
    if (!record || !record.isActive) return badRequest(res, 'كود الوصول غير صحيح');
    if (record.expiresAt && record.expiresAt < new Date()) return badRequest(res, 'كود الوصول منتهي الصلاحية');
    if (record.usageLimit && record.usedCount >= record.usageLimit) return badRequest(res, 'تم استخدام كود الوصول بالكامل');
    return ok(res, { valid: true });
  })
);

// POST /api/tasks/:id/submit — إرسال إثبات إنجاز مهمة
router.post(
  '/:id/submit',
  validateBody(z.object({ accessCode: z.string().optional(), proofUrl: z.string().url().optional() })),
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task || task.status !== 'ACTIVE') return notFound(res, 'المهمة غير موجودة أو غير مفعّلة');

    if (task.requiresCode) {
      if (!req.body.accessCode) return badRequest(res, 'كود الوصول مطلوب لهذه المهمة');
      const codeRecord = await prisma.taskAccessCode.findUnique({ where: { code: req.body.accessCode.toUpperCase() } });
      if (!codeRecord || !codeRecord.isActive) return badRequest(res, 'كود الوصول غير صحيح');
      if (codeRecord.expiresAt && codeRecord.expiresAt < new Date()) return badRequest(res, 'كود الوصول منتهي الصلاحية');
      await prisma.taskAccessCode.update({ where: { id: codeRecord.id }, data: { usedCount: { increment: 1 } } });
    }

    const existing = await prisma.taskSubmission.findFirst({ where: { userId: req.user.id, taskId: task.id } });
    if (existing) return badRequest(res, 'تم إرسال هذه المهمة مسبقاً');

    const submission = await prisma.taskSubmission.create({
      data: {
        userId: req.user.id,
        taskId: task.id,
        accessCode: req.body.accessCode,
        proofUrl: req.body.proofUrl,
        reward: task.reward,
      },
    });

    await prisma.taskStreak.upsert({
      where: { userId: req.user.id },
      update: { currentStreak: { increment: 1 }, lastCompletedAt: new Date() },
      create: { userId: req.user.id, currentStreak: 1, longestStreak: 1, lastCompletedAt: new Date() },
    });

    return ok(res, submission);
  })
);

module.exports = router;
