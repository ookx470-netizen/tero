const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signUserAccessToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, type: 'user' }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

function signUserRefreshToken(user) {
  return jwt.sign({ sub: user.id, type: 'user_refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
}

function signAdminToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email, role: admin.role, type: 'admin' }, env.jwt.adminSecret, {
    expiresIn: env.jwt.adminExpiresIn,
  });
}

function verifyUserAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyUserRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

function verifyAdminToken(token) {
  return jwt.verify(token, env.jwt.adminSecret);
}

module.exports = {
  signUserAccessToken,
  signUserRefreshToken,
  signAdminToken,
  verifyUserAccessToken,
  verifyUserRefreshToken,
  verifyAdminToken,
};
