#!/usr/bin/env node
// Simulasi siswa (bot) untuk mencoba permainan tanpa banyak HP.
// Pemakaian: node tools/bots.js <KODE_RUANG> [jumlah=10] [akurasi=0.75] [url=http://localhost:3000]
const { io } = require('socket.io-client');
const { CHARACTERS } = require('../public/js/shared/characters.js');

const [code, nArg, accArg, urlArg] = process.argv.slice(2);
if (!code) { console.log('Pemakaian: node tools/bots.js <KODE_RUANG> [jumlah] [akurasi] [url]'); process.exit(1); }
const N = Math.min(20, Number(nArg) || 10);
const ACC = accArg == null ? 0.75 : Number(accArg);
const URL = urlArg || process.env.URL || 'http://localhost:3000';
const NAMES = ['Andi', 'Bunga', 'Citra', 'Dimas', 'Eka', 'Fajar', 'Gita', 'Hana', 'Indra', 'Joko', 'Kirana', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri', 'Raka', 'Sari', 'Tono', 'Wulan'];

// Bot hanya bisa "pintar" bila server dijalankan dengan DEMO_HINTS=1 (kunci jawaban ikut dikirim).
// Tanpa itu bot menjawab acak.
for (let i = 0; i < N; i++) {
  setTimeout(() => {
    const s = io(URL, { transports: ['websocket'] });
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? i : '');
    const charId = CHARACTERS[i % CHARACTERS.length].id;
    let answeredIdx = -1;
    s.on('connect', () => {
      s.emit('player:join', { code, name, charId }, (res) => {
        if (res.error) console.log(name, 'gagal:', res.error);
        else console.log(`${name} bergabung (${charId})`);
      });
    });
    s.on('p:state', (v) => {
      if (v.state === 'question' && v.myAnswer == null && v.question && answeredIdx !== v.question.index) {
        answeredIdx = v.question.index;
        const delay = 1500 + Math.random() * Math.min(12000, v.question.remainingMs - 1500);
        setTimeout(() => {
          const guess = v.question.hint != null && Math.random() < ACC ? v.question.hint : Math.floor(Math.random() * 4);
          s.emit('player:answer', { choice: guess }, () => {});
        }, delay);
      }
    });
    s.on('p:closed', () => process.exit(0));
  }, i * 250);
}
