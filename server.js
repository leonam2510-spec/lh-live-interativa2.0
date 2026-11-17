const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
​const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
​app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'online' }));
​let tiktokConn = null;
let liveUser = null;
​function stopTikTok() {
if (tiktokConn) {
try { tiktokConn.disconnect(); } catch (e) {}
tiktokConn = null;
liveUser = null;
}
}
​io.on('connection', (socket) => {
if (liveUser) socket.emit('tiktok_status', { connected: true, username: liveUser });
​socket.on('connect_tiktok', async ({ username }) => {
const clean = String(username || '').trim().replace(/^@/, '');
if (!clean) return socket.emit('tiktok_error', { message: 'Digite um @usuario válido.' });
stopTikTok();
try {
const mod = await import('tiktok-live-connector');
const Conn = mod.TikTokLiveConnection || mod.WebcastPushConnection || mod.default?.TikTokLiveConnection;
const conn = new Conn(clean, { processInitialData: false, enableExtendedGiftInfo: true });
await conn.connect();
tiktokConn = conn;
liveUser = clean;
io.emit('tiktok_status', { connected: true, username: clean });
​conn.on('chat', (d) => io.emit('tiktok_chat', { nickname: d.user?.nickname || d.nickname || 'Fã', comment: d.comment || '' }));
conn.on('like', (d) => io.emit('tiktok_like', { nickname: d.user?.nickname || d.nickname || 'Fã', likeCount: d.likeCount || 1 }));
conn.on('gift', (d) => {
if (d.giftType === 1 && !d.repeatEnd) return;
const coins = (d.giftDetails?.diamondCount || d.diamondCount || 1) * (d.repeatCount || 1);
io.emit('tiktok_gift', { nickname: d.user?.nickname || d.nickname || 'Fã', repeatCount: d.repeatCount || 1, totalCoins: coins });
});
conn.on('follow', (d) => io.emit('tiktok_follow', { nickname: d.user?.nickname || d.nickname || 'Fã' }));
conn.on('streamEnd', () => { stopTikTok(); io.emit('tiktok_status', { connected: false, username: clean }); });
conn.on('error', () => {});
} catch (err) {
socket.emit('tiktok_error', { message: Abra a live de @${clean} no TikTok antes de conectar! });
}
});
​socket.on('disconnect_tiktok', () => { stopTikTok(); io.emit('tiktok_status', { connected: false }); });
socket.on('sync_command', (p) => socket.broadcast.emit('remote_command', p));
});
​const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Servidor rodando na porta ' + PORT));
