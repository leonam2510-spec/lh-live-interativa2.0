const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
​const app = express();
const server = http.createServer(app);
const io = new Server(server, {
cors: {
origin: '*',
methods: ['GET', 'POST']
}
});
​app.use(express.static(__dirname));
​app.get('/', (req, res) => {
res.sendFile(path.join(__dirname, 'index.html'));
});
​app.get('/health', (req, res) => {
res.json({ status: 'online', app: 'LH Live Interativa' });
});
​let activeTikTokConnection = null;
let currentLiveUsername = null;
​function disconnectCurrentTikTok() {
if (activeTikTokConnection) {
try {
activeTikTokConnection.disconnect();
} catch (err) {
console.error('Erro ao desconectar:', err.message);
}
activeTikTokConnection = null;
currentLiveUsername = null;
}
}
​io.on('connection', (socket) => {
console.log('[Socket] Dispositivo conectado:', socket.id);
​if (currentLiveUsername) {
socket.emit('tiktok_status', {
connected: true,
username: currentLiveUsername,
message: Conectado à live de @${currentLiveUsername}
});
}
​socket.on('connect_tiktok', async ({ username }) => {
const cleanUser = String(username || '').trim().replace(/^@/, '');
if (!cleanUser) {
socket.emit('tiktok_error', { message: 'Digite um @usuario válido do TikTok.' });
return;
}
​disconnectCurrentTikTok();
console.log([TikTok] Conectando em @${cleanUser}...);
​try {
const tiktokModule = await import('tiktok-live-connector');
const ConnectorClass =
tiktokModule.TikTokLiveConnection ||
tiktokModule.WebcastPushConnection ||
(tiktokModule.default && (tiktokModule.default.TikTokLiveConnection || tiktokModule.default.WebcastPushConnection));
​const WebcastEvent = tiktokModule.WebcastEvent || (tiktokModule.default && tiktokModule.default.WebcastEvent) || {};
const ControlEvent = tiktokModule.ControlEvent || (tiktokModule.default && tiktokModule.default.ControlEvent) || {};
​if (!ConnectorClass) {
throw new Error('Conector do TikTok não carregado.');
}
​const tiktokLive = new ConnectorClass(cleanUser, {
processInitialData: false,
enableExtendedGiftInfo: true
});
​const state = await tiktokLive.connect();
activeTikTokConnection = tiktokLive;
currentLiveUsername = cleanUser;
​console.log([TikTok] Conectado em @${cleanUser}!);
io.emit('tiktok_status', {
connected: true,
username: cleanUser,
roomId: state && state.roomId ? state.roomId : '',
message: Live conectada em @${cleanUser}!
});
​const chatEvent = WebcastEvent.CHAT || 'chat';
const likeEvent = WebcastEvent.LIKE || 'like';
const giftEvent = WebcastEvent.GIFT || 'gift';
const followEvent = WebcastEvent.FOLLOW || 'follow';
const endEvent = ControlEvent.DISCONNECTED || 'streamEnd';
​tiktokLive.on(chatEvent, (data) => {
const user = data.user || data;
io.emit('tiktok_chat', {
uniqueId: user.uniqueId || 'espectador',
nickname: user.nickname || user.uniqueId || 'Espectador',
comment: data.comment || ''
});
});
​tiktokLive.on(likeEvent, (data) => {
const user = data.user || data;
io.emit('tiktok_like', {
uniqueId: user.uniqueId || 'espectador',
nickname: user.nickname || user.uniqueId || 'Espectador',
likeCount: data.likeCount || 1
});
});
​tiktokLive.on(giftEvent, (data) => {
if (data.giftType === 1 && !data.repeatEnd) return;
const user = data.user || data;
const giftDetails = data.giftDetails || data;
const repeatCount = data.repeatCount || 1;
const diamondCount = giftDetails.diamondCount || data.diamondCount || 1;
const totalCoins = diamondCount * repeatCount;
​io.emit('tiktok_gift', {
uniqueId: user.uniqueId || 'espectador',
nickname: user.nickname || user.uniqueId || 'Espectador',
giftName: giftDetails.giftName || data.giftName || 'Presente',
repeatCount,
totalCoins
});
});
​tiktokLive.on(followEvent, (data) => {
const user = data.user || data;
io.emit('tiktok_follow', {
uniqueId: user.uniqueId || 'espectador',
nickname: user.nickname || user.uniqueId || 'Espectador'
});
});
​tiktokLive.on(endEvent, () => {
disconnectCurrentTikTok();
io.emit('tiktok_status', {
connected: false,
username: cleanUser,
message: 'Transmissão encerrada no TikTok.'
});
});
​tiktokLive.on('error', (err) => {
console.error('[TikTok] Aviso:', err && err.message ? err.message : err);
});
} catch (err) {
console.error([TikTok] Falha ao conectar em @${cleanUser}:, err.message);
socket.emit('tiktok_error', {
message: Não foi possível conectar em @${cleanUser}. Abra sua live no TikTok primeiro e tente de novo!
});
}
});
​socket.on('disconnect_tiktok', () => {
disconnectCurrentTikTok();
io.emit('tiktok_status', {
connected: false,
message: 'Live desconectada.'
});
});
​socket.on('sync_command', (payload) => {
socket.broadcast.emit('remote_command', payload);
});
});
​const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(LH Live Interativa online na porta ${PORT});
});
