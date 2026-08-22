const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, notFound, badRequest } = require('../../utils/response');
const { validateBody } = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');
const { generateTaskAccessCode } = require('../../utils/codes');

router.use(requireAdmin);

// ============================== TASKS ==============================

// GET /api/admin/tasks
router.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const { weekNumber, status } = req.query;
    const where = { ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}), ...(status ? { status } : {}) };
    const tasks = await prisma.task.findMany({ where, orderBy: [{ weekNumber: 'desc' }, { createdAt: 'asc' }] });
    return ok(res, tasks);
  })
);

// POST /api/admin/tasks
router.post(
  '/tasks',
  validateBody(
    z.object({
      title: z.string().min(2),
      description: z.string().optional(),
      link: z.string().url().optional(),
      weekNumber: z.number().int(),
      reward: z.number().nonnegative().default(0),
      points: z.number().int().nonnegative().default(0),
      requiresCode: z.boolean().default(true),
    })
  ),
  asyncHandler(async (req, res) => {
    const task = await prisma.task.create({ data: req.body });
    return ok(res, task);
  })
);

// POST /api/admin/tasks/bulk — إنشاء عدة مهام دفعة وحدة
router.post(
  '/tasks/bulk',
  validateBody(z.object({ tasks: z.array(z.object({ title: z.string(), weekNumber: z.number().int(), reward: z.number().default(0), link: z.string().optional(), requiresCode: z.boolean().default(true) })) })),
  asyncHandler(async (req, res) => {
    const result = await prisma.task.createMany({ data: req.body.tasks });
    return ok(res, { created: result.count });
  })
);

// POST /api/admin/tasks/bulk-action — تفعيل/أرشفة عدة مهام دفعة وحدة
router.post(
  '/tasks/bulk-action',
  validateBody(z.object({ ids: z.array(z.string()), action: z.enum(['ACTIVATE', 'ARCHIVE', 'DRAFT']) })),
  asyncHandler(async (req, res) => {
    const statusMap = { ACTIVATE: 'ACTIVE', ARCHIVE: 'ARCHIVED', DRAFT: 'DRAFT' };
    const result = await prisma.task.updateMany({ where: { id: { in: req.body.ids } }, data: { status: statusMap[req.body.action] } });
    return ok(res, { updated: result.count });
  })
);

// POST /api/admin/tasks/bulk-delete-ids
router.post(
  '/tasks/bulk-delete-ids',
  validateBody(z.object({ ids: z.array(z.string()) })),
  asyncHandler(async (req, res) => {
    const result = await prisma.task.deleteMany({ where: { id: { in: req.body.ids } } });
    return ok(res, { deleted: result.count });
  })
);

// GET /api/admin/tasks/export-csv
router.get(
  '/tasks/export-csv',
  asyncHandler(async (req, res) => {
    const tasks = await prisma.task.findMany({ orderBy: { weekNumber: 'desc' } });
    const header = 'id,title,weekNumber,reward,points,status,link\n';
    const rows = tasks
      .map((t) => [t.id, JSON.stringify(t.title), t.weekNumber, t.reward, t.points, t.status, t.link || ''].join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"');
    return res.send(header + rows);
  })
);

// POST /api/admin/tasks/import-csv — يستقبل صفوف CSV جاهزة كـ JSON من الفرونت اند بعد التحليل
router.post(
  '/tasks/import-csv',
  validateBody(z.object({ rows: z.array(z.object({ title: z.string(), weekNumber: z.number().int(), reward: z.number().default(0), link: z.string().optional() })) })),
  asyncHandler(async (req, res) => {
    const result = await prisma.task.createMany({ data: req.body.rows });
    return ok(res, { imported: result.count });
  })
);

// POST /api/admin/tasks/new-week — ينسخ مهام آخر أسبوع لأسبوع جديد
router.post(
  '/tasks/new-week',
  asyncHandler(async (req, res) => {
    const last = await prisma.task.findFirst({ orderBy: { weekNumber: 'desc' } });
    const nextWeek = (last?.weekNumber || 0) + 1;
    const lastWeekTasks = last ? await prisma.task.findMany({ where: { weekNumber: last.weekNumber } }) : [];
    if (lastWeekTasks.length) {
      await prisma.task.createMany({
        data: lastWeekTasks.map((t) => ({
          title: t.title,
          description: t.description,
          link: t.link,
          weekNumber: nextWeek,
          reward: t.reward,
          points: t.points,
          requiresCode: t.requiresCode,
        })),
      });
    }
    return ok(res, { weekNumber: nextWeek, copiedTasks: lastWeekTasks.length });
  })
);

// POST /api/admin/tasks/recycle-links — يعيد تدوير روابط مهام أسبوع معيّن (placeholder لمنطق أعمال خاص)
router.post(
  '/tasks/recycle-links',
  validateBody(z.object({ weekNumber: z.number().int() })),
  asyncHandler(async (req, res) => {
    const tasks = await prisma.task.findMany({ where: { weekNumber: req.body.weekNumber } });
    return ok(res, { affected: tasks.length });
  })
);

// GET /api/admin/tasks/:id
router.get(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return notFound(res);
    return ok(res, task);
  })
);

// PUT /api/admin/tasks/:id
router.put(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.update({ where: { id: req.params.id }, data: req.body });
    return ok(res, task);
  })
);

// DELETE /api/admin/tasks/:id
router.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    await prisma.task.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  })
);

// ============================== TASK ACCESS CODES ==============================

// GET /api/admin/task-access-codes
router.get(
  '/task-access-codes',
  asyncHandler(async (req, res) => {
    const codes = await prisma.taskAccessCode.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return ok(res, codes);
  })
);

// GET /api/admin/task-access-codes/current — آخر كود مفعّل
router.get(
  '/task-access-codes/current',
  asyncHandler(async (req, res) => {
    const code = await prisma.taskAccessCode.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    return ok(res, code);
  })
);

// POST /api/admin/task-access-codes
router.post(
  '/task-access-codes',
  validateBody(z.object({ weekNumber: z.number().int().optional(), usageLimit: z.number().int().optional(), expiresAt: z.string().datetime().optional() })),
  asyncHandler(async (req, res) => {
    const code = await prisma.taskAccessCode.create({
      data: {
        code: generateTaskAccessCode(),
        weekNumber: req.body.weekNumber,
        usageLimit: req.body.usageLimit,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      },
    });
    return ok(res, code);
  })
);

// PUT /api/admin/task-access-codes/:id
router.put(
  '/task-access-codes/:id',
  asyncHandler(async (req, res) => {
    const code = await prisma.taskAccessCode.update({ where: { id: req.params.id }, data: req.body });
    return ok(res, code);
  })
);

// DELETE /api/admin/task-access-codes/:id
router.delete(
  '/task-access-codes/:id',
  asyncHandler(async (req, res) => {
    await prisma.taskAccessCode.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  })
);

// ============================== TASK CODE GEN ==============================

// GET /api/admin/task-code-gen/settings
router.get(
  '/task-code-gen/settings',
  asyncHandler(async (req, res) => {
    let settings = await prisma.taskCodeGenSettings.findFirst();
    if (!settings) settings = await prisma.taskCodeGenSettings.create({ data: {} });
    return ok(res, settings);
  })
);

// PUT /api/admin/task-code-gen/settings
router.put(
  '/task-code-gen/settings',
  asyncHandler(async (req, res) => {
    let settings = await prisma.taskCodeGenSettings.findFirst();
    if (!settings) settings = await prisma.taskCodeGenSettings.create({ data: req.body });
    else settings = await prisma.taskCodeGenSettings.update({ where: { id: settings.id }, data: req.body });
    return ok(res, settings);
  })
);

// GET /api/admin/task-code-gen/log
router.get(
  '/task-code-gen/log',
  asyncHandler(async (req, res) => {
    const logs = await prisma.taskCodeGenLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return ok(res, logs);
  })
);

// POST /api/admin/task-code-gen/manual
router.post(
  '/task-code-gen/manual',
  asyncHandler(async (req, res) => {
    const code = await prisma.taskAccessCode.create({ data: { code: generateTaskAccessCode() } });
    const log = await prisma.taskCodeGenLog.create({ data: { code: code.code, method: 'manual', generatedBy: req.admin.id } });
    return ok(res, { code, log });
  })
);

// POST /api/admin/task-code-gen/resend/:id
router.post(
  '/task-code-gen/resend/:id',
  asyncHandler(async (req, res) => {
    const log = await prisma.taskCodeGenLog.findUnique({ where: { id: req.params.id } });
    if (!log) return notFound(res);
    // ملاحظة: هنا مكان إعادة الإرسال الفعلي عبر تيليجرام/إيميل
    return ok(res, { resent: true });
  })
);

// ============================== TASK SUBMISSIONS ==============================

// GET /api/admin/task-submissions
router.get(
  '/task-submissions',
  asyncHandler(async (req, res) => {
    const { status, taskId } = req.query;
    const where = { ...(status ? { status } : {}), ...(taskId ? { taskId } : {}) };
    const submissions = await prisma.taskSubmission.findMany({
      where,
      include: { user: { select: { id: true, email: true, fullName: true } }, task: { select: { id: true, title: true } } },
      orderBy: { submittedAt: 'desc' },
      take: 200,
    });
    return ok(res, submissions);
  })
);

// GET /api/admin/task-submissions/stats
router.get(
  '/task-submissions/stats',
  asyncHandler(async (req, res) => {
    const [pending, approved, rejected] = await Promise.all([
      prisma.taskSubmission.count({ where: { status: 'PENDING' } }),
      prisma.taskSubmission.count({ where: { status: 'APPROVED' } }),
      prisma.taskSubmission.count({ where: { status: 'REJECTED' } }),
    ]);
    return ok(res, { pending, approved, rejected });
  })
);

// PUT /api/admin/task-submissions/:id — قبول/رفض
router.put(
  '/task-submissions/:id',
  validateBody(z.object({ status: z.enum(['APPROVED', 'REJECTED']) })),
  asyncHandler(async (req, res) => {
    const submission = await prisma.taskSubmission.findUnique({ where: { id: req.params.id } });
    if (!submission) return notFound(res);
    if (submission.status !== 'PENDING') return badRequest(res, 'تمت مراجعة هذا الطلب مسبقاً');

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.taskSubmission.update({
        where: { id: req.params.id },
        data: { status: req.body.status, reviewedAt: new Date(), reviewedBy: req.admin.id },
      });
      if (req.body.status === 'APPROVED' && Number(s.reward) > 0) {
        await tx.wallet.update({ where: { userId: s.userId }, data: { balance: { increment: s.reward } } });
        await tx.transaction.create({
          data: { userId: s.userId, type: 'TASK_REWARD', amount: s.reward, status: 'COMPLETED', meta: { taskSubmissionId: s.id } },
        });
      }
      return s;
    });

    return ok(res, updated);
  })
);

// ============================== DASHBOARD / ACTIVITY / ALERTS ==============================

// GET /api/admin/task-dashboard
router.get(
  '/task-dashboard',
  asyncHandler(async (req, res) => {
    const [activeTasks, pendingSubmissions, approvedToday] = await Promise.all([
      prisma.task.count({ where: { status: 'ACTIVE' } }),
      prisma.taskSubmission.count({ where: { status: 'PENDING' } }),
      prisma.taskSubmission.count({ where: { status: 'APPROVED', reviewedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ]);
    return ok(res, { activeTasks, pendingSubmissions, approvedToday });
  })
);

// GET /api/admin/task-activity
router.get(
  '/task-activity',
  asyncHandler(async (req, res) => {
    const recent = await prisma.taskSubmission.findMany({
      orderBy: { submittedAt: 'desc' },
      take: 50,
      include: { user: { select: { email: true } }, task: { select: { title: true } } },
    });
    return ok(res, recent);
  })
);

// GET /api/admin/task-alerts
router.get(
  '/task-alerts',
  asyncHandler(async (req, res) => {
    const alerts = await prisma.taskAlert.findMany({ where: { resolved: false }, orderBy: { createdAt: 'desc' } });
    return ok(res, alerts);
  })
);

// PUT /api/admin/task-alerts/:id — تعليم كمحلول
router.put(
  '/task-alerts/:id',
  asyncHandler(async (req, res) => {
    const alert = await prisma.taskAlert.update({ where: { id: req.params.id }, data: { resolved: true } });
    return ok(res, alert);
  })
);

module.exports = router;
