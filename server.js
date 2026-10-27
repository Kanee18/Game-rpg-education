// Server game "Petualangan Melawan Raja Iblis"
// Menjalankan web (layar guru + kontroler HP siswa) dan komunikasi real-time.
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Room, validateQuestions } = require('./src/game');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // ruang dihapus setelah 3 jam tanpa aktivitas
// Hanya untuk uji coba dengan tools/bots.js: kirim kunci jawaban ke klien siswa.
const DEMO_HINTS = process.env.DEMO_HINTS === '1';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

app.get('/api/info', (req, res) => {
  res.json({ publicUrl: PUBLIC_URL || null, lan: lanAddresses(), port: PORT });
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text) return res.status(400).end();
  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b1030', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (e) {
    res.status(500).end();
  }
});

// ---------------------------------------------------------------- ruang
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

const hostRoom = (code) => `host:${code}`;
const playersRoom = (code) => `players:${code}`;

function emitHost(room, ev, data) { io.to(hostRoom(room.code)).emit(ev, data); }
function syncHost(room) { emitHost(room, 'room:update', room.hostSnapshot()); }
function syncPlayer(room, playerId) {
  const p = room.players.get(playerId);
  if (!p || !p.socketId) return;
  const view = room.playerView(playerId);
  if (DEMO_HINTS && view.question) view.question.hint = room.questions[room.qIndex].answer;
  io.to(p.socketId).emit('p:state', view);
}
function syncAllPlayers(room) { for (const id of room.players.keys()) syncPlayer(room, id); }

function doReveal(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
  const payload = room.reveal();
  if (!payload) return;
  emitHost(room, 'reveal', payload);
  syncAllPlayers(room);
  syncHost(room);
}

function scheduleTimeout(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => { if (room.state === 'question') doReveal(room); }, room.timeLimit * 1000 + 400);
}

io.on('connection', (socket) => {
  let role = null; // 'host' | 'player'
  let room = null;
  let playerId = null;

  const ack = (cb, data) => { if (typeof cb === 'function') cb(data); };

  // ------------------------------------------------ guru
  socket.on('host:create', (data, cb) => {
    const err = validateQuestions(data && data.questions);
    if (err) return ack(cb, { error: err });
    const code = newCode();
    room = new Room(code, {
      questions: data.questions,
      timeLimit: data.timeLimit,
      shuffleQuestions: !!data.shuffle,
      title: data.title,
    });
    rooms.set(code, room);
    role = 'host';
    socket.join(hostRoom(code));
    ack(cb, { ok: true, code, hostToken: room.hostToken, snapshot: room.hostSnapshot() });
  });

  socket.on('host:resume', ({ code, hostToken } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r || r.hostToken !== hostToken) return ack(cb, { error: 'Ruang tidak ditemukan' });
    room = r; role = 'host';
    socket.join(hostRoom(r.code));
    ack(cb, { ok: true, snapshot: r.hostSnapshot() });
  });

  const hostOnly = (fn) => (data, cb) => {
    if (role !== 'host' || !room) return ack(cb, { error: 'Bukan host' });
    room.touch();
    fn(data || {}, cb);
  };

  socket.on('host:start', hostOnly((data, cb) => {
    const r = room.start();
    if (r.error) return ack(cb, r);
    syncHost(room); syncAllPlayers(room);
    ack(cb, { ok: true, snapshot: room.hostSnapshot() });
  }));

  socket.on('host:next', hostOnly((data, cb) => {
    const r = room.nextQuestion();
    if (r.error) return ack(cb, r);
    scheduleTimeout(room);
    emitHost(room, 'question:start', room.currentQuestion(true));
    syncAllPlayers(room); syncHost(room);
    ack(cb, { ok: true });
  }));

  socket.on('host:endQuestion', hostOnly((data, cb) => {
    if (room.state === 'question') doReveal(room);
    ack(cb, { ok: true });
  }));

  socket.on('host:kick', hostOnly(({ playerId: pid }, cb) => {
    const p = room.players.get(pid);
    if (p && p.socketId) io.to(p.socketId).emit('p:kicked');
    room.removePlayer(pid);
    syncHost(room);
    if (room.state === 'question' && room.allAnswered()) doReveal(room);
    ack(cb, { ok: true });
  }));

  socket.on('host:close', hostOnly((data, cb) => {
    io.to(playersRoom(room.code)).emit('p:closed');
    if (room.timer) clearTimeout(room.timer);
    rooms.delete(room.code);
    ack(cb, { ok: true });
  }));

  // ------------------------------------------------ siswa
  socket.on('player:check', ({ code } = {}, cb) => {
    const r = rooms.get(String(code || '').trim().toUpperCase());
    if (!r) return ack(cb, { error: 'Kode ruang tidak ditemukan. Periksa lagi kodenya.' });
    ack(cb, {
      ok: true, state: r.state, count: r.players.size, title: r.title,
      taken: [...r.players.values()].map((p) => p.charId),
    });
  });

  socket.on('player:join', ({ code, name, charId, playerToken } = {}, cb) => {
    const r = rooms.get(String(code || '').trim().toUpperCase());
    if (!r) return ack(cb, { error: 'Kode ruang tidak ditemukan' });
    const res = r.addPlayer({ name, charId, playerToken });
    if (res.error) return ack(cb, res);
    const p = res.player;
    if (p.socketId && p.socketId !== socket.id) {
      const old = io.sockets.sockets.get(p.socketId);
      if (old) old.emit('p:replaced');
    }
    p.socketId = socket.id;
    p.connected = true;
    room = r; role = 'player'; playerId = p.id;
    socket.join(playersRoom(r.code));
    ack(cb, { ok: true, playerId: p.id, playerToken: p.token, code: r.code, view: r.playerView(p.id) });
    emitHost(r, 'player:joined', { player: r.publicPlayer(p), rejoined: !!res.rejoined });
    syncHost(r);
  });

  socket.on('player:answer', ({ choice } = {}, cb) => {
    if (role !== 'player' || !room) return ack(cb, { error: 'Belum bergabung' });
    const r = room.submitAnswer(playerId, choice);
    if (r.error) return ack(cb, r);
    ack(cb, { ok: true });
    emitHost(room, 'answer:progress', { playerId, answered: [...room.answers.keys()], total: room.players.size });
    syncPlayer(room, playerId);
    if (room.allAnswered()) setTimeout(() => { if (room.state === 'question' && room.allAnswered()) doReveal(room); }, 600);
  });

  socket.on('disconnect', () => {
    if (role === 'player' && room) {
      const p = room.players.get(playerId);
      if (p && p.socketId === socket.id) {
        p.connected = false;
        syncHost(room);
        if (room.state === 'question' && room.allAnswered()) doReveal(room);
      }
    }
  });
});

// Bersihkan ruang lama
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.lastActivity > ROOM_TTL_MS) {
      if (r.timer) clearTimeout(r.timer);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => {
  const lan = lanAddresses();
  console.log('\n  ⚔  Petualangan Melawan Raja Iblis — server berjalan');
  console.log(`  Layar guru   : http://localhost:${PORT}/host`);
  for (const ip of lan) console.log(`  Jaringan LAN : http://${ip}:${PORT}  (siswa memindai QR di layar guru)`);
  if (PUBLIC_URL) console.log(`  URL publik   : ${PUBLIC_URL}`);
  console.log('');
});
