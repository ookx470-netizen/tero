const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const env = require('./config/env');
const { verifyUserAccessToken } = require('./utils/jwt');

const server = http.createServer(app);

// /api/socket — قناة الإشعارات اللحظية والتحديثات المباشرة (رصيد، إشعارات...)
const io = new Server(server, {
  path: '/api/socket',
  cors: { origin: env.corsOrigin, credentials: true },
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (token) {
      const payload = verifyUserAccessToken(token);
      socket.userId = payload.sub;
    }
    next();
  } catch (err) {
    next(); // نسمح بالاتصال بدون مصادقة لكن بدون الانضمام لغرفة خاصة
  }
});

io.on('connection', (socket) => {
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }
  socket.on('disconnect', () => {});
});

// نتيح الوصول لـ io من أي مكان بالسيرفر عبر app.locals
app.locals.io = io;

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`✅ Tero backend يعمل على المنفذ ${env.port} (${env.nodeEnv})`);
});
