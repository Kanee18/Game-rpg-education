// Logika permainan (server-authoritative). Tidak bergantung pada socket,
// sehingga mudah diuji: lihat test/game.test.js
const crypto = require('crypto');
const { CHARACTERS, PHASES, MAX_PLAYERS } = require('../public/js/shared/characters.js');

const CHAR_IDS = new Set(CHARACTERS.map((c) => c.id));
const BASE_DAMAGE = 100;
const TARGET_ACCURACY = 0.75; // HP musuh dikalibrasi agar kelas dengan ~75% benar menang tepat waktu
const ULT_MULT = 2.5;
const MAX_HP = 100;
const REVIVE_HP = 40;

const token = () => crypto.randomBytes(12).toString('hex');

function validateQuestions(list) {
  if (!Array.isArray(list)) return 'Daftar soal tidak valid';
  if (list.length < PHASES.length) return `Minimal ${PHASES.length} soal (satu untuk setiap musuh)`;
  if (list.length > 200) return 'Maksimal 200 soal';
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (!q || typeof q.q !== 'string' || !q.q.trim()) return `Soal ${i + 1}: teks pertanyaan kosong`;
    if (!Array.isArray(q.options) || q.options.length !== 4) return `Soal ${i + 1}: harus ada 4 pilihan (A-D)`;
    if (q.options.some((o) => typeof o !== 'string' || !o.trim())) return `Soal ${i + 1}: ada pilihan yang kosong`;
    if (![0, 1, 2, 3].includes(q.answer)) return `Soal ${i + 1}: kunci jawaban harus A, B, C, atau D`;
  }
  return null;
}

// Bagi jumlah soal ke tiap fase musuh berdasarkan bobot (metode sisa terbesar).
function planPhases(total) {
  const n = PHASES.length;
  const counts = new Array(n).fill(1);
  let left = total - n;
  const wsum = PHASES.reduce((s, p) => s + p.weight, 0);
  const exact = PHASES.map((p) => (p.weight / wsum) * left);
  exact.forEach((e, i) => { counts[i] += Math.floor(e); });
  left -= exact.reduce((s, e) => s + Math.floor(e), 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < left; k++) counts[order[k % n][1]]++;
  let acc = 0;
  return counts.map((c) => { acc += c; return { count: c, end: acc }; });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Room {
  constructor(code, { questions, timeLimit = 20, shuffleQuestions = false, title = '' }) {
    this.code = code;
    this.hostToken = token();
    this.title = String(title || '').slice(0, 80);
    this.questions = (shuffleQuestions ? shuffle(questions) : questions).map((q) => ({
      q: String(q.q).slice(0, 500),
      options: q.options.map((o) => String(o).slice(0, 160)),
      answer: q.answer,
    }));
    this.timeLimit = Math.max(5, Math.min(120, Number(timeLimit) || 20));
    this.plan = planPhases(this.questions.length);
    this.players = new Map(); // id -> player
    this.state = 'lobby'; // lobby | question | reveal | finished
    this.qIndex = -1;
    this.phaseIndex = 0;
    this.enemy = null;
    this.answers = new Map(); // playerId -> { choice, at }
    this.qStartedAt = 0;
    this.lastReveal = null;
    this.victory = null;
    this.createdAt = Date.now();
    this.touch();
  }

  touch() { this.lastActivity = Date.now(); }

  // ---------- pemain
  addPlayer({ name, charId, playerToken }) {
    name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    if (playerToken) {
      const existing = [...this.players.values()].find((p) => p.token === playerToken);
      if (existing) {
        if (name) existing.name = name;
        if (charId && CHAR_IDS.has(charId) && this.state === 'lobby') existing.charId = charId;
        return { player: existing, rejoined: true };
      }
    }
    if (!name) return { error: 'Nama tidak boleh kosong' };
    if (!CHAR_IDS.has(charId)) return { error: 'Pilih karakter terlebih dahulu' };
    if (this.state === 'finished') return { error: 'Petualangan sudah selesai' };
    if (this.players.size >= MAX_PLAYERS) return { error: `Party penuh (maksimal ${MAX_PLAYERS} petualang)` };
    const lower = name.toLowerCase();
    if ([...this.players.values()].some((p) => p.name.toLowerCase() === lower)) {
      return { error: 'Nama sudah dipakai teman lain, gunakan nama lain' };
    }
    const player = {
      id: token().slice(0, 8),
      token: token(),
      name,
      charId,
      score: 0,
      correct: 0,
      answeredCount: 0,
      streak: 0,
      bestStreak: 0,
      hp: MAX_HP,
      ko: false,
      connected: true,
      joinedAt: Date.now(),
    };
    this.players.set(player.id, player);
    this.touch();
    return { player };
  }

  removePlayer(id) {
    this.players.delete(id);
    this.answers.delete(id);
  }

  publicPlayer(p) {
    return {
      id: p.id, name: p.name, charId: p.charId, score: p.score, correct: p.correct,
      streak: p.streak, hp: p.hp, ko: p.ko, connected: p.connected,
    };
  }

  leaderboard() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinedAt - b.joinedAt)
      .map((p, i) => ({ rank: i + 1, ...this.publicPlayer(p), answeredCount: p.answeredCount, bestStreak: p.bestStreak }));
  }

  rankOf(id) {
    const lb = this.leaderboard();
    const r = lb.find((x) => x.id === id);
    return r ? r.rank : null;
  }

  // ---------- musuh
  makeEnemy(index) {
    const ph = PHASES[index];
    const n = Math.max(1, this.players.size);
    const quota = this.plan[index].count;
    const hpMax = Math.max(50, Math.round(quota * n * BASE_DAMAGE * TARGET_ACCURACY));
    return {
      index, key: ph.enemy, name: ph.name, title: ph.title, stage: ph.stage, phase: ph.phase || 1, boss: !!ph.boss,
      hp: hpMax, hpMax, plannedEnd: this.plan[index].end,
    };
  }

  // ---------- alur
  start() {
    if (this.state !== 'lobby') return { error: 'Permainan sudah dimulai' };
    if (this.players.size === 0) return { error: 'Belum ada petualang yang bergabung' };
    this.phaseIndex = 0;
    this.enemy = this.makeEnemy(0);
    this.state = 'reveal'; // "jeda" sebelum soal pertama
    this.touch();
    return { ok: true };
  }

  nextQuestion() {
    if (this.state !== 'reveal') return { error: 'Belum bisa lanjut' };
    if (this.qIndex + 1 >= this.questions.length || this.victory !== null) return { error: 'Soal sudah habis' };
    this.qIndex++;
    this.state = 'question';
    this.answers.clear();
    this.qStartedAt = Date.now();
    this.touch();
    return { ok: true };
  }

  currentQuestion(includeAnswer) {
    const q = this.questions[this.qIndex];
    if (!q) return null;
    const out = {
      index: this.qIndex, total: this.questions.length, q: q.q, options: q.options,
      timeLimit: this.timeLimit,
      remainingMs: Math.max(0, this.qStartedAt + this.timeLimit * 1000 - Date.now()),
    };
    if (includeAnswer) out.answer = q.answer;
    return out;
  }

  submitAnswer(playerId, choice) {
    if (this.state !== 'question') return { error: 'Waktu menjawab sudah habis' };
    const p = this.players.get(playerId);
    if (!p) return { error: 'Pemain tidak ditemukan' };
    if (![0, 1, 2, 3].includes(choice)) return { error: 'Pilihan tidak valid' };
    if (this.answers.has(playerId)) return { error: 'Kamu sudah menjawab' };
    const elapsed = Date.now() - this.qStartedAt;
    if (elapsed > this.timeLimit * 1000 + 800) return { error: 'Waktu menjawab sudah habis' };
    this.answers.set(playerId, { choice, at: elapsed });
    this.touch();
    return { ok: true };
  }

  allAnswered() {
    const active = [...this.players.values()].filter((p) => p.connected);
    return active.length > 0 && active.every((p) => this.answers.has(p.id));
  }

  isTimeUp() {
    return this.state === 'question' && Date.now() >= this.qStartedAt + this.timeLimit * 1000 + 300;
  }

  // Hitung hasil satu soal. Mengembalikan payload "reveal" untuk animasi layar guru.
  reveal() {
    if (this.state !== 'question') return null;
    const q = this.questions[this.qIndex];
    const enemy = this.enemy;
    const ph = PHASES[enemy.index];
    const hpBefore = enemy.hp;
    const counts = [0, 0, 0, 0];
    let none = 0;
    const results = [];
    let totalDamage = 0;
    let shield = false;
    let heal = false;

    for (const p of this.players.values()) {
      const a = this.answers.get(p.id);
      const correct = !!a && a.choice === q.answer;
      if (a) counts[a.choice]++; else none++;
      const r = { id: p.id, choice: a ? a.choice : null, correct, points: 0, damage: 0, ultimate: false, revived: false };
      if (correct) {
        const ratio = Math.max(0, Math.min(1, 1 - a.at / (this.timeLimit * 1000)));
        p.streak++;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
        p.correct++;
        r.ultimate = p.streak >= 3 && p.streak % 3 === 0;
        r.points = 500 + Math.round(500 * ratio) + Math.min(p.streak - 1, 5) * 50 + (r.ultimate ? 200 : 0);
        r.damage = Math.round(BASE_DAMAGE * (0.85 + 0.3 * ratio) * (r.ultimate ? ULT_MULT : 1));
        p.score += r.points;
        totalDamage += r.damage;
        if (p.ko) { p.ko = false; p.hp = REVIVE_HP; r.revived = true; }
        if (r.ultimate && p.charId === 'paladin') shield = true;
        if (r.ultimate && p.charId === 'biarawati') heal = true;
      } else {
        p.streak = 0;
      }
      if (a) p.answeredCount++;
      results.push(r);
    }

    // Ultimate biarawati: pulihkan party sebelum serangan balik.
    if (heal) {
      for (const p of this.players.values()) {
        const r = results.find((x) => x.id === p.id);
        if (p.ko) { p.ko = false; r.revived = true; }
        p.hp = Math.min(MAX_HP, p.hp + 40);
      }
    }

    // Kerusakan pada musuh. Musuh tidak bisa tumbang sebelum soal terakhir jatahnya
    // sehingga semua soal tetap dikerjakan.
    // Sisa HP minimum turun bertahap (6% per soal jatah yang tersisa).
    const left = enemy.plannedEnd - (this.qIndex + 1);
    const floor = left > 0 ? Math.ceil(enemy.hpMax * 0.06 * left) : 0;
    let held = false;
    let hpNew = Math.max(0, enemy.hp - totalDamage);
    if (hpNew < floor) { hpNew = Math.min(enemy.hp, floor); held = totalDamage > 0; }
    enemy.hp = hpNew;
    const defeated = enemy.hp === 0;

    // Serangan balik musuh untuk yang salah / tidak menjawab.
    const counterBase = Math.round(ph.counter * (shield ? 0.5 : 1));
    for (const r of results) {
      if (r.correct) continue;
      const p = this.players.get(r.id);
      if (p.ko) { r.hit = 0; continue; }
      r.hit = counterBase;
      p.hp = Math.max(0, p.hp - counterBase);
      if (p.hp === 0) { p.ko = true; r.ko = true; }
    }
    for (const r of results) {
      const p = this.players.get(r.id);
      r.hp = p.hp; r.koNow = p.ko; r.score = p.score; r.streak = p.streak;
    }

    const isLastQuestion = this.qIndex + 1 >= this.questions.length;
    let next = null;
    let finished = false;
    if (defeated) {
      if (enemy.index + 1 < PHASES.length) {
        if (isLastQuestion) {
          finished = true; this.victory = false;
        } else {
          this.phaseIndex = enemy.index + 1;
          // Istirahat: party pulih penuh sebelum musuh berikutnya.
          for (const p of this.players.values()) { p.hp = MAX_HP; p.ko = false; }
          this.enemy = this.makeEnemy(this.phaseIndex);
          next = { ...this.enemy };
        }
      } else {
        finished = true; this.victory = true;
      }
    } else if (isLastQuestion) {
      finished = true; this.victory = false;
    }

    this.state = finished ? 'finished' : 'reveal';
    const payload = {
      index: this.qIndex,
      total: this.questions.length,
      answer: q.answer,
      counts, none,
      results,
      shield, heal,
      enemy: { ...enemy, index: enemy.index, hpBefore, hpAfter: defeated ? 0 : enemy.hp, defeated, held, damage: totalDamage, hpMax: enemy.hpMax, key: enemy.key, phase: enemy.phase },
      next,
      finished,
      victory: this.victory,
      leaderboard: this.leaderboard().slice(0, 5),
    };
    // enemy (variabel lokal) bisa sudah diganti; pastikan payload memakai data musuh lama
    payload.enemy.name = PHASES[payload.enemy.index].name;
    this.lastReveal = payload;
    this.touch();
    return payload;
  }

  hostSnapshot() {
    return {
      code: this.code,
      title: this.title,
      state: this.state,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      qIndex: this.qIndex,
      total: this.questions.length,
      timeLimit: this.timeLimit,
      plan: this.plan,
      enemy: this.enemy,
      question: this.state === 'question' ? this.currentQuestion(true) : null,
      answered: [...this.answers.keys()],
      lastReveal: this.lastReveal,
      victory: this.victory,
      leaderboard: this.state === 'finished' ? this.leaderboard() : null,
    };
  }

  // Ringkasan untuk HP siswa
  playerView(id) {
    const p = this.players.get(id);
    if (!p) return null;
    const base = {
      state: this.state,
      me: { ...this.publicPlayer(p), rank: this.rankOf(id), total: this.players.size },
      enemy: this.enemy ? { name: this.enemy.name, stage: this.enemy.stage, phase: this.enemy.phase } : null,
      title: this.title,
    };
    if (this.state === 'question') {
      base.question = this.currentQuestion(false);
      const a = this.answers.get(id);
      base.myAnswer = a ? a.choice : null;
    }
    if ((this.state === 'reveal' || this.state === 'finished') && this.lastReveal) {
      const r = this.lastReveal.results.find((x) => x.id === id);
      if (r) base.result = { ...r, answer: this.lastReveal.answer, index: this.lastReveal.index };
    }
    if (this.state === 'finished') {
      base.victory = this.victory;
      base.totalQuestions = this.questions.length;
    }
    return base;
  }
}

module.exports = { Room, planPhases, validateQuestions, MAX_HP };
