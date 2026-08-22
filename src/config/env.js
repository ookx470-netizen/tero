require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  return v;
}

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev_access_secret_change_me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    adminSecret: required('JWT_ADMIN_SECRET', 'dev_admin_secret_change_me'),
    adminExpiresIn: process.env.JWT_ADMIN_EXPIRES_IN || '12h',
  },

  defaultNetwork: process.env.DEFAULT_NETWORK || 'polygon',
};
