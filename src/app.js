const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const walletRoutes = require('./routes/wallet.routes');
const membershipRoutes = require('./routes/membership.routes');
const referralsRoutes = require('./routes/referrals.routes');
const tasksRoutes = require('./routes/tasks.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const transactionsRoutes = require('./routes/transactions.routes');
const storageRoutes = require('./routes/storage.routes');
const siteRoutes = require('./routes/site.routes');

const adminAuthRoutes = require('./routes/admin/admin.auth.routes');
const adminUsersRoutes = require('./routes/admin/admin.users.routes');
const adminTasksRoutes = require('./routes/admin/admin.tasks.routes');
const adminMembershipRoutes = require('./routes/admin/admin.membership.routes');
const adminTreasuryRoutes = require('./routes/admin/admin.treasury.routes');
const adminWalletOpsRoutes = require('./routes/admin/admin.walletops.routes');
const adminRpcRoutes = require('./routes/admin/admin.rpc.routes');
const adminHonorRoutes = require('./routes/admin/admin.honor.routes');
const adminLeadersRoutes = require('./routes/admin/admin.leaders.routes');
const adminNotificationsRoutes = require('./routes/admin/admin.notifications.routes');
const adminSiteSettingsRoutes = require('./routes/admin/admin.sitesettings.routes');
const adminWithdrawalsRoutes = require('./routes/admin/admin.withdrawals.routes');
const adminMiscRoutes = require('./routes/admin/admin.misc.routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

// حد عام لمعدل الطلبات لحماية السيرفر
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));

// --- مسارات المستخدم العام ---
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/membership', membershipRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api', siteRoutes); // finance-settings, maintenance-status, networks/status, site-settings/public/*

// --- مسارات الأدمن ---
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin', adminTasksRoutes); // tasks, task-access-codes, task-code-gen, task-submissions, task-dashboard, task-activity, task-alerts
app.use('/api/admin/membership-plans', adminMembershipRoutes);
app.use('/api/admin', adminTreasuryRoutes); // treasury, treasury-addresses, treasury-settings
app.use('/api/admin', adminWalletOpsRoutes); // hot-wallet, sweep-manager, sweeps, gas-management, wallet-movements, deposits, withdrawal-logs
app.use('/api/admin/rpc-monitor', adminRpcRoutes);
app.use('/api/admin/honor-points', adminHonorRoutes);
app.use('/api/admin/leaders', adminLeadersRoutes);
app.use('/api/admin/notifications', adminNotificationsRoutes);
app.use('/api/admin/site-settings', adminSiteSettingsRoutes);
app.use('/api/admin/withdrawals', adminWithdrawalsRoutes);
app.use('/api/admin', adminMiscRoutes); // maintenance, referral-commission-config, wallet-change-requests, chat/upload-avatar

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
