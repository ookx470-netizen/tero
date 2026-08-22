// بيانات أولية بسيطة حتى تبدأ المنصة بشكل صحيح: أدمن، خطط عضوية افتراضية، نسب عمولة إحالة، إعدادات أساسية
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@teronetwork.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

  const existingAdmin = await prisma.admin.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.admin.create({
      data: { email: adminEmail, passwordHash, name: 'Super Admin', role: 'SUPER_ADMIN' },
    });
    console.log(`✅ تم إنشاء حساب أدمن: ${adminEmail} / ${adminPassword} — غيّر كلمة المرور فوراً بعد أول تسجيل دخول`);
  }

  const plans = [
    { name: 'Starter', price: 0, durationDays: 36500, dailyProfitRate: 0, referralCommissionRate: 5, sortOrder: 0 },
    { name: 'Bronze', price: 25, durationDays: 30, dailyProfitRate: 0.5, referralCommissionRate: 8, sortOrder: 1 },
    { name: 'Silver', price: 100, durationDays: 30, dailyProfitRate: 0.7, referralCommissionRate: 10, sortOrder: 2 },
    { name: 'Gold', price: 500, durationDays: 30, dailyProfitRate: 1.0, referralCommissionRate: 12, sortOrder: 3 },
  ];
  for (const plan of plans) {
    const exists = await prisma.membershipPlan.findFirst({ where: { name: plan.name } });
    if (!exists) await prisma.membershipPlan.create({ data: plan });
  }

  const commissionLevels = [
    { level: 1, percentage: 10 },
    { level: 2, percentage: 5 },
    { level: 3, percentage: 2 },
  ];
  for (const c of commissionLevels) {
    await prisma.referralCommissionConfig.upsert({ where: { level: c.level }, update: {}, create: c });
  }

  await prisma.siteSetting.upsert({
    where: { key: 'maintenance_mode' },
    update: {},
    create: { key: 'maintenance_mode', value: { enabled: false, message: null }, isPublic: true },
  });
  await prisma.siteSetting.upsert({
    where: { key: 'finance_settings' },
    update: {},
    create: { key: 'finance_settings', value: { minWithdrawal: 10, maxWithdrawal: 5000, withdrawalFeePercent: 0 }, isPublic: false },
  });
  await prisma.siteSetting.upsert({
    where: { key: 'emergency_withdrawal_mode' },
    update: {},
    create: { key: 'emergency_withdrawal_mode', value: { enabled: false }, isPublic: true },
  });
  await prisma.siteSetting.upsert({
    where: { key: 'telegram_support_username' },
    update: {},
    create: { key: 'telegram_support_username', value: 'TeroSupport', isPublic: true },
  });

  console.log('✅ تمت تهيئة قاعدة البيانات الجديدة ببيانات أولية بنجاح');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
