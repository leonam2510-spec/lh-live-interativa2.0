'use strict';

const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);

function isAllowedSocketOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;

  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configuredOrigins.includes(origin)) return true;

  const forwardedHost = request.headers['x-forwarded-host'];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || request.headers.host;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'http')
    .split(',')[0]
    .trim();

  return Boolean(host && origin === `${protocol}://${host}`);
}

const io = new Server(httpServer, {
  allowRequest: (request, callback) => {
    callback(null, isAllowedSocketOrigin(request));
  },
  maxHttpBufferSize: 1e6,
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'online',
    app: 'LH Live Interativa',
    socketConnections: io.engine.clientsCount,
  });
});

app.get('/', (_request, response) => {
  response.sendFile(path.join(__dirname, 'index.html'));
});

let activeTikTokConnection = null;
let currentLiveUsername = null;
let tiktokOperation = Promise.resolve();

function enqueueTikTokOperation(operation) {
  tiktokOperation = tiktokOperation.then(operation, operation).catch((error) => {
    console.error('[TikTok] Falha na operação:', error && error.message ? error.message : error);
  });
  return tiktokOperation;
}

async function disconnectTikTok(notify = true) {
  const connection = activeTikTokConnection;
  activeTikTokConnection = null;
  currentLiveUsername = null;

  if (connection) {
    try {
      await connection.disconnect();
    } catch (error) {
      console.warn('[TikTok] A conexão já estava encerrada:', error && error.message ? error.message : error);
    }
  }

  if (notify) io.emit('tiktok_status', { connected: false });
}

function getTikTokUsername(payload) {
  const username = String(payload && payload.username ? payload.username : '')
    .trim()
    .replace(/^@/, '');

  if (!/^[A-Za-z0-9._]{1,24}$/.test(username)) {
    throw new Error('Digite um @usuario válido do TikTok.');
  }

  return username;
}

function emitTikTokEvents(connection, events) {
  const webcastEvent = events.WebcastEvent || {};
  const controlEvent = events.ControlEvent || {};
  const eventName = (key, fallback) => webcastEvent[key] || controlEvent[key] || fallback;

  connection.on(eventName('CHAT', 'chat'), (data = {}) => {
    const user = data.user || data;
    io.emit('tiktok_chat', {
      nickname: user.nickname || user.uniqueId || 'Espectador',
      comment: String(data.comment || ''),
    });
  });

  connection.on(eventName('LIKE', 'like'), (data = {}) => {
    const user = data.user || data;
    io.emit('tiktok_like', {
      nickname: user.nickname || user.uniqueId || 'Espectador',
      likeCount: Number(data.likeCount) || 1,
    });
  });

  connection.on(eventName('GIFT', 'gift'), (data = {}) => {
    if (data.giftType === 1 && !data.repeatEnd) return;

    const user = data.user || data;
    const giftDetails = data.extendedGiftInfo || data.giftDetails || data;
    const repeatCount = Number(data.repeatCount) || 1;
    const diamondCount = Number(giftDetails.diamondCount || data.diamondCount) || 1;

    io.emit('tiktok_gift', {
      nickname: user.nickname || user.uniqueId || 'Espectador',
      repeatCount,
      totalCoins: diamondCount * repeatCount,
    });
  });

  connection.on(eventName('FOLLOW', 'follow'), (data = {}) => {
    const user = data.user || data;
    io.emit('tiktok_follow', {
      nickname: user.nickname || user.uniqueId || 'Espectador',
    });
  });
}

async function connectTikTok(username, requestingSocket) {
  await disconnectTikTok(false);

  try {
    const tiktokModule = await import('tiktok-live-connector');
    const TikTokLiveConnection =
      tiktokModule.TikTokLiveConnection ||
      (tiktokModule.default && tiktokModule.default.TikTokLiveConnection);

    if (typeof TikTokLiveConnection !== 'function') {
      throw new Error('A dependência tiktok-live-connector não exportou TikTokLiveConnection.');
    }

    const connection = new TikTokLiveConnection(username, {
      processInitialData: false,
      enableExtendedGiftInfo: true,
    });

    activeTikTokConnection = connection;
    currentLiveUsername = username;
    emitTikTokEvents(connection, tiktokModule);

    const streamEndEvent =
      (tiktokModule.WebcastEvent && tiktokModule.WebcastEvent.STREAM_END) || 'streamEnd';
    connection.on(streamEndEvent, () => {
      if (activeTikTokConnection !== connection) return;
      activeTikTokConnection = null;
      currentLiveUsername = null;
      io.emit('tiktok_status', {
        connected: false,
        username,
        message: 'Transmissão encerrada no TikTok.',
      });
    });

    const errorEvent =
      (tiktokModule.ControlEvent && tiktokModule.ControlEvent.ERROR) || 'error';
    connection.on(errorEvent, (error) => {
      console.error('[TikTok] Aviso:', error && error.message ? error.message : error);
    });

    await connection.connect();

    if (activeTikTokConnection === connection) {
      io.emit('tiktok_status', { connected: true, username });
      console.log(`[TikTok] Conectado à live de @${username}.`);
    }
  } catch (error) {
    console.error(`[TikTok] Não foi possível conectar a @${username}:`, error && error.message ? error.message : error);
    if (activeTikTokConnection) {
      await disconnectTikTok(false);
    }
    requestingSocket.emit('tiktok_error', {
      message: `Não foi possível conectar à live de @${username}. Confirme que a transmissão está ao vivo e tente novamente.`,
    });
    io.emit('tiktok_status', { connected: false, username });
  }
}

io.on('connection', (socket) => {
  console.log('[Socket.IO] Cliente conectado:', socket.id);

  if (currentLiveUsername) {
    socket.emit('tiktok_status', { connected: true, username: currentLiveUsername });
  }

  socket.on('connect_tiktok', (payload) => {
    let username;
    try {
      username = getTikTokUsername(payload);
    } catch (error) {
      socket.emit('tiktok_error', { message: error.message });
      return;
    }

    enqueueTikTokOperation(() => connectTikTok(username, socket));
  });

  socket.on('disconnect_tiktok', () => {
    enqueueTikTokOperation(() => disconnectTikTok(true));
  });

  socket.on('sync_command', (payload) => {
    if (!payload || payload.type !== 'testAction') return;
    const allowedActions = new Set([
      'join',
      'cheap_gift',
      'expensive_gift',
      'follow',
      'likes',
      'comment',
      'crowd',
    ]);
    if (!allowedActions.has(payload.action)) return;
    socket.broadcast.emit('remote_command', payload);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.IO] Cliente desconectado:', socket.id, reason);
  });
});

const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`LH Live Interativa online na porta ${port}.`);
});
