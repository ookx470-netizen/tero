const { PrismaClient } = require('@prisma/client');

// عميل Prisma وحيد يُعاد استخدامه بكل المشروع (singleton)
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
