// Layar guru: pengaturan, lobby (QR), pertarungan, dan hasil akhir.
(function () {
  const $ = (s) => document.querySelector(s);
  const LETTERS = ['A', 'B', 'C', 'D'];
  const SHAPES = ['▲', '◆', '●', '■'];
  const CHARS = Object.fromEntries(GameData.CHARACTERS.map((c) => [c.id, c]));
  const SESSION_KEY = 'rpg_host_session';

  const socket = io();
  let battle = null;
  let room = null;          // snapshot terakhir dari server
  let session = null;       // { code, hostToken }
  let joinUrl = '';
  let animating = false;
  let pendingSnapshot = null;
  let timerInt = null;
  let autoNext = false;
  let autoTimer = null;
  let lastQuestion = null;
  let finalLeaderboard = null;

  // ---------------------------------------------------------- skala UI 1920x1080
  function fit() {
    const stage = $('#stage');
    const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.width = 1920 * k + 'px';
    stage.style.height = 1080 * k + 'px';
    $('#ui').style.transform = `scale(${k})`;
  }
  window.addEventListener('resize', fit);

  function toast(msg, ms = 2500) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------------------------------------------------------- setup
  Editor.init();
  $('#btn-create').onclick = createRoom;

  function createRoom() {
    const err = Editor.validate();
    $('#setup-error').textContent = err || '';
    if (err) return;
    const s = Editor.settings();
    Sfx.unlock();
    $('#btn-create').disabled = true;
    socket.emit('host:create', { questions: Editor.questions, timeLimit: s.time, shuffle: s.shuffle, title: s.title }, (res) => {
      $('#btn-create').disabled = false;
      if (res.error) { $('#setup-error').textContent = res.error; return; }
      session = { code: res.code, hostToken: res.hostToken };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* abaikan */ }
      enterGame(res.snapshot);
    });
  }

  async function computeJoinUrl(code) {
    let base = location.origin;
    try {
      const info = await fetch('/api/info').then((r) => r.json());
      if (info.publicUrl) base = info.publicUrl;
      else if (['localhost', '127.0.0.1', '::1'].includes(location.hostname) && info.lan.length) {
        base = `${location.protocol}//${info.lan[0]}:${location.port || info.port}`;
      }
    } catch (e) { /* abaikan */ }
    return `${base}/play?room=${code}`;
  }

  async function enterGame(snapshot) {
    $('#setup').hidden = true;
    $('#game').hidden = false;
    fit();
    if (!battle) battle = new Battle($('#cv'));
    battle.onCinema = (on) => document.body.classList.toggle('cinema', on);
    // muat semua sprite di awal
    GameData.CHARACTERS.forEach((c) => Sprites.load(c.id));
    room = snapshot;
    joinUrl = await computeJoinUrl(snapshot.code);
    const qrSrc = '/api/qr?text=' + encodeURIComponent(joinUrl);
    $('#qr').src = qrSrc; $('#qr-mini').src = qrSrc;
    $('#room-code').textContent = snapshot.code;
    $('#code-mini').textContent = snapshot.code;
    $('#join-url').textContent = joinUrl.replace(/^https?:\/\//, '');
    $('#lobby-kicker').textContent = snapshot.title || 'Ruang Petualangan';
    $('#controls').hidden = false;
    battle.stage = 1; battle.phase = 1;
    battle.setParty(snapshot.players);
    if (snapshot.state === 'lobby') {
      showLobby(true);
      battle.enemyBarVisible = false;
    } else {
      // melanjutkan sesi (misal halaman guru di-refresh)
      showLobby(false);
      $('#corner').hidden = false;
      battle.setEnemy({ ...snapshot.enemy, entrance: false });
      battle.enemyBarVisible = true;
      if (snapshot.state === 'question' && snapshot.question) startQuestion(snapshot.question, snapshot.answered);
      else if (snapshot.state === 'finished') showFinal(snapshot);
      else showNextButton();
    }
    renderLobby();
  }

  // ---------------------------------------------------------- lobby
  function showLobby(on) {
    $('#lobby').hidden = !on;
  }

  function renderLobby() {
    if (!room) return;
    const ps = room.players;
    $('#party-count').textContent = ps.length;
    $('#btn-start').disabled = ps.length === 0;
    $('#party-list').innerHTML = ps.map((p) => {
      const c = CHARS[p.charId];
      return `<button class="party-chip${p.connected ? '' : ' off'}" data-id="${p.id}" style="--c:${c.color}">
        <span class="dot"></span>${escapeHtml(p.name)}<small>${c.name}</small></button>`;
    }).join('') || '<p class="hint">Menunggu petualang pertama…</p>';
  }

  $('#party-list').addEventListener('click', (e) => {
    const b = e.target.closest('.party-chip'); if (!b) return;
    const p = room.players.find((x) => x.id === b.dataset.id);
    if (p && confirm(`Keluarkan ${p.name} dari party?`)) socket.emit('host:kick', { playerId: p.id });
  });

  $('#btn-start').onclick = () => {
    Sfx.unlock();
    socket.emit('host:start', {}, async (res) => {
      if (res.error) return toast(res.error);
      room = res.snapshot;
      showLobby(false);
      $('#corner').hidden = false;
      battle.enemyBarVisible = true;
      animating = true;
      await battle.playIntro(room.enemy);
      animating = false;
      flushSnapshot();
      nextQuestion();
    });
  };

  // ---------------------------------------------------------- soal
  function nextQuestion() {
    clearTimeout(autoTimer);
    $('#btn-next').hidden = true;
    $('#leader').hidden = true;
    socket.emit('host:next', {}, (res) => { if (res && res.error) toast(res.error); });
  }
  $('#btn-next').onclick = () => { Sfx.click(); nextQuestion(); };
  $('#btn-skip').onclick = () => socket.emit('host:endQuestion');

  function startQuestion(q, answered = []) {
    lastQuestion = q;
    const panel = $('#qpanel');
    panel.hidden = false;
    panel.classList.remove('reveal', 'collapsed');
    $('#q-num').textContent = `Soal ${q.index + 1}/${q.total}`;
    $('#q-text').textContent = q.q;
    $('#q-options').innerHTML = q.options.map((o, k) => `
      <div class="q-option opt-${k}" data-k="${k}">
        <span class="shape">${SHAPES[k]}</span><b>${LETTERS[k]}</b><span class="txt">${escapeHtml(o)}</span>
        <span class="count"></span><span class="bar"></span>
      </div>`).join('');
    $('#btn-skip').hidden = false;
    $('#btn-next').hidden = true;
    $('#leader').hidden = true;
    battle.questionActive = true;
    battle.setAnswered(answered);
    updateAnswered(answered.length);
    Sfx.question();
    const endsAt = Date.now() + q.remainingMs;
    clearInterval(timerInt);
    let lastSec = -1;
    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      const sec = Math.ceil(left / 1000);
      $('#q-timer-num').textContent = sec;
      $('#q-timer-bar').style.width = (100 * left) / (q.timeLimit * 1000) + '%';
      $('#qpanel').classList.toggle('hurry', sec <= 5);
      if (sec !== lastSec && sec <= 5 && sec > 0) Sfx.tick();
      lastSec = sec;
      if (left <= 0) clearInterval(timerInt);
    };
    tick();
    timerInt = setInterval(tick, 100);
  }

  function updateAnswered(n) {
    const total = room ? room.players.filter((p) => p.connected).length : 0;
    $('#q-answered-box').textContent = `${n}/${total} menjawab`;
  }

  socket.on('question:start', (q) => startQuestion(q));
  socket.on('answer:progress', ({ answered }) => {
    battle.setAnswered(answered);
    updateAnswered(answered.length);
    Sfx.click();
  });

  socket.on('reveal', async (payload) => {
    clearInterval(timerInt);
    $('#btn-skip').hidden = true;
    animating = true;
    // tampilkan kunci jawaban & distribusi
    const panel = $('#qpanel');
    panel.classList.add('reveal');
    panel.classList.remove('hurry');
    const total = Math.max(1, payload.results.length);
    panel.querySelectorAll('.q-option').forEach((el) => {
      const k = +el.dataset.k;
      el.classList.toggle('correct', k === payload.answer);
      el.querySelector('.count').textContent = payload.counts[k];
      el.querySelector('.bar').style.width = (100 * payload.counts[k]) / total + '%';
    });
    const nCorrect = payload.results.filter((r) => r.correct).length;
    $('#q-answered-box').textContent = `✔ ${nCorrect} dari ${payload.results.length} benar`;
    Sfx[nCorrect > 0 ? 'correct' : 'wrong']();
    await sleep(2200);
    panel.classList.add('collapsed');
    await battle.playReveal(payload);
    animating = false;
    flushSnapshot();
    if (payload.finished) {
      panel.hidden = true;
      if (payload.victory) await battle.playVictory(); else await battle.playDefeat();
      showFinal(room);
      return;
    }
    showLeader(payload.leaderboard);
    showNextButton();
  });

  function showNextButton() {
    $('#btn-next').hidden = false;
    $('#btn-skip').hidden = true;
    if (autoNext) {
      let n = 6;
      const upd = () => { $('#btn-next').textContent = `▶ Soal berikutnya (${n})`; };
      upd();
      clearInterval(autoTimer);
      autoTimer = setInterval(() => { n--; upd(); if (n <= 0) { clearInterval(autoTimer); nextQuestion(); } }, 1000);
    } else $('#btn-next').textContent = '▶ Soal berikutnya';
  }

  $('#btn-auto').onclick = () => {
    autoNext = !autoNext;
    $('#btn-auto').textContent = `Auto: ${autoNext ? 'Nyala' : 'Mati'}`;
    $('#btn-auto').classList.toggle('on', autoNext);
    if (!$('#btn-next').hidden) { clearInterval(autoTimer); showNextButton(); }
  };

  function showLeader(lb) {
    if (!lb || !lb.length) return;
    $('#leader-list').innerHTML = lb.map((p) => `<li style="--c:${CHARS[p.charId].color}"><span class="rk">${p.rank}</span><span class="nm">${escapeHtml(p.name)}</span><b>${p.score}</b>${p.streak >= 2 ? `<span class="st">🔥${p.streak}</span>` : ''}</li>`).join('');
    $('#leader').hidden = false;
  }

  // ---------------------------------------------------------- snapshot
  socket.on('room:update', (snap) => {
    if (animating) { pendingSnapshot = snap; return; }
    applySnapshot(snap);
  });
  function flushSnapshot() {
    if (pendingSnapshot) { applySnapshot(pendingSnapshot); pendingSnapshot = null; }
  }
  function applySnapshot(snap) {
    room = snap;
    if (battle) battle.setParty(snap.players);
    renderLobby();
    if (snap.state === 'question' && !$('#qpanel').classList.contains('reveal')) updateAnswered(snap.answered.length);
  }
  socket.on('player:joined', ({ player, rejoined }) => {
    if (!rejoined) toast(`✨ ${player.name} bergabung sebagai ${CHARS[player.charId].name}!`);
  });

  // ---------------------------------------------------------- hasil akhir
  function showFinal(snap) {
    const lb = snap.leaderboard || [];
    finalLeaderboard = lb;
    const victory = snap.victory;
    $('#final').hidden = false;
    $('#qpanel').hidden = true;
    $('#leader').hidden = true;
    $('#btn-next').hidden = true; $('#btn-skip').hidden = true;
    $('#corner').hidden = true; $('#controls').hidden = true;
    clearInterval(autoTimer);
    $('#final-title').textContent = victory ? '🏆 KEMENANGAN! 🏆' : 'Party Mundur…';
    $('#final').classList.toggle('lose', !victory);
    $('#final-sub').textContent = victory
      ? 'Raja Iblis Azaroth berhasil dikalahkan! Inilah para pahlawan hari ini:'
      : 'Raja Iblis masih bertahan. Pelajari lagi materinya lalu tantang kembali!';
    const top = lb.slice(0, 3);
    const order = [1, 0, 2].filter((i) => top[i]);
    $('#podium').innerHTML = order.map((i) => {
      const p = top[i];
      return `<div class="pod pod-${i + 1}" style="--c:${CHARS[p.charId].color}">
        <canvas width="260" height="300" data-char="${p.charId}"></canvas>
        <div class="pod-name">${escapeHtml(p.name)}</div><div class="pod-score">${p.score} poin</div>
        <div class="pod-block">${i + 1}</div></div>`;
    }).join('');
    $('#podium').querySelectorAll('canvas').forEach(drawPodiumChar);
    const total = room ? room.total : 0;
    $('#final-table').innerHTML = '<tr><th>#</th><th>Nama</th><th>Karakter</th><th>Skor</th><th>Benar</th><th>Akurasi</th><th>Streak terbaik</th></tr>' +
      lb.map((p) => `<tr><td>${p.rank}</td><td>${escapeHtml(p.name)}</td><td>${CHARS[p.charId].name}</td><td><b>${p.score}</b></td><td>${p.correct}/${total}</td><td>${total ? Math.round((100 * p.correct) / total) : 0}%</td><td>${p.bestStreak}</td></tr>`).join('');
  }

  async function drawPodiumChar(cv) {
    const sheet = await Sprites.load(cv.dataset.char);
    const ctx = cv.getContext('2d');
    const anim = new Sprites.Animator(cv.dataset.char, CHARS[cv.dataset.char].fps);
    anim.set('idle', true);
    let last = performance.now();
    const loop = (now) => {
      if (!document.body.contains(cv)) return;
      anim.update((now - last) / 1000); last = now;
      ctx.clearRect(0, 0, cv.width, cv.height);
      Sprites.draw(ctx, sheet, 'idle', anim.frame(), 130, 285, 250);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  $('#btn-csv').onclick = () => {
    const total = room ? room.total : 0;
    const rows = [['Peringkat', 'Nama', 'Karakter', 'Skor', 'Benar', 'Jumlah Soal', 'Akurasi (%)', 'Streak Terbaik']];
    (finalLeaderboard || []).forEach((p) => rows.push([p.rank, p.name, CHARS[p.charId].name, p.score, p.correct, total, total ? Math.round((100 * p.correct) / total) : 0, p.bestStreak]));
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const title = (room && room.title) || 'petualangan';
    a.download = `hasil-${title.replace(/[^\w\- ]+/g, '').trim() || 'petualangan'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  function resetToSetup() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
    location.href = '/host';
  }
  $('#btn-done').onclick = () => { socket.emit('host:close', {}, resetToSetup); };
  $('#btn-again').onclick = () => {
    socket.emit('host:close', {}, () => {
      try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.setItem('rpg_autocreate', '1'); } catch (e) { /* abaikan */ }
      location.href = '/host';
    });
  };
  $('#btn-quit').onclick = () => {
    if (confirm('Akhiri permainan dan tutup ruang? Semua siswa akan keluar.')) socket.emit('host:close', {}, resetToSetup);
  };
  $('#btn-mute').onclick = () => { Sfx.setMuted(!Sfx.muted); $('#btn-mute').textContent = Sfx.muted ? '🔇' : '🔊'; };
  $('#btn-mute').textContent = Sfx.muted ? '🔇' : '🔊';
  $('#btn-full').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  // ---------------------------------------------------------- lanjutkan sesi
  function tryResume() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { /* abaikan */ }
    if (!s) {
      let auto = null;
      try { auto = sessionStorage.getItem('rpg_autocreate'); sessionStorage.removeItem('rpg_autocreate'); } catch (e) { /* abaikan */ }
      if (auto) createRoom();
      return;
    }
    socket.emit('host:resume', s, (res) => {
      if (res.error) { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ } return; }
      session = s;
      if ($('#game').hidden) enterGame(res.snapshot);
    });
  }
  socket.on('connect', () => {
    if (session) socket.emit('host:resume', session, () => {});
    else tryResume();
  });

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
})();
