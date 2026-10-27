// Kontroler HP siswa: gabung ruang, pilih karakter, jawab A/B/C/D.
(function () {
  const $ = (s) => document.querySelector(s);
  const CHARS = GameData.CHARACTERS;
  const BY_ID = Object.fromEntries(CHARS.map((c) => [c.id, c]));
  const LETTERS = ['A', 'B', 'C', 'D'];

  const socket = io();
  let code = (new URLSearchParams(location.search).get('room') || '').toUpperCase().trim();
  let selected = null;
  let me = null;           // { playerId, playerToken, name, charId }
  let view = null;
  let lastResultIndex = -1;
  let timerInt = null;
  let lastState = null;

  // ---------------------------------------------------------- avatar canvas
  const avatars = new Map(); // canvas -> { charId, anim, h }
  function setAvatar(cv, charId, anim = 'idle', loop = true, onEnd = null) {
    const ch = BY_ID[charId];
    let a = avatars.get(cv);
    if (!a || a.charId !== charId) {
      a = { charId, anim: new Sprites.Animator(charId, ch.fps) };
      avatars.set(cv, a);
      Sprites.load(charId);
    }
    a.anim.set(anim, loop, onEnd);
  }
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    for (const [cv, a] of avatars) {
      if (!cv.offsetParent) continue; // tidak terlihat
      a.anim.update(dt);
      const sheet = Sprites.get(a.charId);
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!sheet) continue;
      const h = cv.height * 0.78;
      const opt = {};
      if (a.ko && a.anim.anim === 'idle') {
        Sprites.draw(ctx, sheet, 'hit', Sprites.frameCount(sheet, 'hit') - 1, cv.width / 2, cv.height - 8, h, { filter: 'grayscale(0.8) brightness(0.7)' });
      } else Sprites.draw(ctx, sheet, a.anim.anim, a.anim.frame(), cv.width / 2, cv.height - 8, h, opt);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------------------------------------------------------- layar
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
  }
  function showView(id) {
    view = id;
    document.querySelectorAll('#s-game .view').forEach((v) => { v.hidden = v.id !== id; });
  }

  function storeKey(c) { return 'rpg_player_' + c; }
  function saveMe() { try { localStorage.setItem(storeKey(code), JSON.stringify(me)); } catch (e) { /* abaikan */ } }
  function loadMe(c) { try { return JSON.parse(localStorage.getItem(storeKey(c))); } catch (e) { return null; } }

  // ---------------------------------------------------------- 1. kode
  $('#form-code').onsubmit = (e) => {
    e.preventDefault();
    code = $('#in-code').value.toUpperCase().trim();
    checkRoom();
  };

  function checkRoom() {
    $('#code-err').textContent = '';
    socket.emit('player:check', { code }, (res) => {
      if (res.error) { show('s-code'); $('#in-code').value = code; $('#code-err').textContent = res.error; return; }
      history.replaceState(null, '', '/play?room=' + code);
      const saved = loadMe(code);
      if (saved && saved.playerToken) return join(saved.name, saved.charId, saved.playerToken, true);
      if (res.state === 'finished') { $('#code-err').textContent = 'Petualangan di ruang ini sudah selesai.'; show('s-code'); return; }
      $('#room-label').textContent = code;
      if (res.title) $('#room-title').textContent = res.title;
      renderChars(res.taken || []);
      show('s-profile');
    });
  }

  // ---------------------------------------------------------- 2. profil
  function renderChars(taken) {
    const counts = {};
    taken.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
    $('#char-grid').innerHTML = CHARS.map((c, i) => `
      <button type="button" class="char-card" data-id="${c.id}" style="--c:${c.color};--i:${i}">
        <canvas width="150" height="170"></canvas>
        <span class="cn">${c.name}</span>
        ${counts[c.id] ? `<span class="taken">${counts[c.id]} teman</span>` : ''}
      </button>`).join('');
    $('#char-grid').querySelectorAll('.char-card').forEach((b) => setAvatar(b.querySelector('canvas'), b.dataset.id));
    const savedName = (() => { try { return localStorage.getItem('rpg_last_name') || ''; } catch (e) { return ''; } })();
    if (savedName && !$('#in-name').value) $('#in-name').value = savedName;
    pick(selected || CHARS[Math.floor(Math.random() * CHARS.length)].id);
  }

  function pick(id) {
    selected = id;
    document.querySelectorAll('.char-card').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
    const c = BY_ID[id];
    const d = $('#char-detail');
    d.style.setProperty('--c', c.color);
    d.innerHTML = `<div class="cd-role">${c.role}</div><div class="cd-name">${c.name}</div><p>${c.desc}</p>
      <div class="skills"><span><em>Serangan</em>${c.attackName}</span><span><em>Ultimate</em>${c.ultimateName}</span></div>`;
  }
  $('#char-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.char-card'); if (b) pick(b.dataset.id);
  });

  $('#form-join').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#in-name').value.trim();
    if (!name) { $('#join-err').textContent = 'Isi nama dulu ya.'; return; }
    try { localStorage.setItem('rpg_last_name', name); } catch (err) { /* abaikan */ }
    join(name, selected, null, false);
  };

  function join(name, charId, playerToken, silent) {
    $('#join-err').textContent = '';
    $('#btn-join').disabled = true;
    socket.emit('player:join', { code, name, charId, playerToken }, (res) => {
      $('#btn-join').disabled = false;
      if (res.error) {
        if (silent) { try { localStorage.removeItem(storeKey(code)); } catch (e) { /* abaikan */ } checkRoom(); return; }
        $('#join-err').textContent = res.error; return;
      }
      me = { playerId: res.playerId, playerToken: res.playerToken, name, charId };
      saveMe();
      show('s-game');
      render(res.view);
      if (navigator.vibrate) navigator.vibrate(40);
    });
  }

  // ---------------------------------------------------------- 3. permainan
  socket.on('p:state', render);

  function render(v) {
    if (!v || !me) return;
    lastState = v;
    const p = v.me;
    me.charId = p.charId; me.name = p.name;
    $('#me-name').textContent = p.name;
    $('#me-dot').style.background = BY_ID[p.charId].color;
    $('#me-score').textContent = p.score;
    $('#me-rank').textContent = p.rank ? `${p.rank}/${p.total}` : '-';
    $('#me-hp').style.width = Math.max(0, p.hp) + '%';
    $('#me-hp').classList.toggle('low', p.hp <= 30);

    if (v.state === 'lobby') {
      waitView('Kamu sudah bergabung!', 'Lihat karaktermu di layar guru. Tunggu guru memulai petualangan…', p);
    } else if (v.state === 'question') {
      if (v.myAnswer == null) questionView(v);
      else lockedView(v.myAnswer);
    } else if (v.state === 'reveal') {
      if (v.result && v.result.index !== lastResultIndex) resultView(v, p);
      else if (!v.result) waitView('Bersiap!', v.enemy ? `${v.enemy.name} muncul! Soal segera dimulai…` : 'Soal segera dimulai…', p);
      else if (view !== 'v-result') resultView(v, p, true);
    } else if (v.state === 'finished') {
      if (v.result && v.result.index !== lastResultIndex) { resultView(v, p); setTimeout(() => finalView(lastState), 4500); } else finalView(v);
    }
  }

  function waitView(title, sub, p) {
    clearInterval(timerInt);
    $('#wait-title').textContent = title;
    $('#wait-sub').textContent = sub;
    if (view !== 'v-wait') setAvatar($('#cv-wait'), p.charId);
    avatars.get($('#cv-wait')).ko = p.ko;
    showView('v-wait');
  }

  function questionView(v) {
    const q = v.question;
    const fresh = view !== 'v-question' || $('#pq-num').dataset.idx !== String(q.index);
    $('#pq-num').textContent = `Soal ${q.index + 1}/${q.total}`;
    $('#pq-num').dataset.idx = q.index;
    $('#pq-enemy').textContent = v.enemy ? `vs ${v.enemy.name}` : '';
    $('#pq-text').textContent = q.q;
    document.querySelectorAll('.ans').forEach((b) => {
      const k = +b.dataset.k;
      b.querySelector('.txt').textContent = q.options[k];
      b.disabled = false;
      b.classList.remove('picked');
    });
    showView('v-question');
    if (fresh) {
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
      const endsAt = Date.now() + q.remainingMs;
      clearInterval(timerInt);
      const tick = () => {
        const left = Math.max(0, endsAt - Date.now());
        $('#pq-timer-bar').style.width = (100 * left) / (q.timeLimit * 1000) + '%';
        $('#pq-timer-bar').classList.toggle('hurry', left < 5000);
        if (left <= 0) { clearInterval(timerInt); document.querySelectorAll('.ans').forEach((b) => { b.disabled = true; }); }
      };
      tick();
      timerInt = setInterval(tick, 100);
    }
  }

  $('#answer-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.ans'); if (!b || b.disabled) return;
    const k = +b.dataset.k;
    document.querySelectorAll('.ans').forEach((x) => { x.disabled = true; });
    b.classList.add('picked');
    if (navigator.vibrate) navigator.vibrate(25);
    socket.emit('player:answer', { choice: k }, (res) => {
      if (res.error) {
        $('#pq-text').textContent = res.error;
        return;
      }
      lockedView(k);
    });
  });

  function lockedView(k) {
    clearInterval(timerInt);
    const el = $('#locked-letter');
    el.textContent = LETTERS[k];
    el.className = 'locked-letter opt-' + k;
    showView('v-locked');
  }

  function resultView(v, p, quiet) {
    clearInterval(timerInt);
    const r = v.result;
    lastResultIndex = r.index;
    const ch = BY_ID[p.charId];
    const banner = $('#res-banner');
    const cv = $('#cv-result');
    if (r.correct) {
      banner.textContent = r.ultimate ? 'Ultimate!' : 'Benar!';
      banner.className = 'res-banner good' + (r.ultimate ? ' ult' : '');
      $('#res-points').textContent = `+${r.points}`;
      $('#res-points').className = 'res-points good';
      $('#res-detail').innerHTML = (r.ultimate ? `<b>${ch.ultimateName}</b> mengguncang musuh! ` : `${ch.attackName} mengenai musuh! `) +
        `Damage <b>${r.damage}</b>.` + (r.streak >= 2 ? `<br><span class="tag">${Icon.flame}Beruntun ${r.streak}×${r.streak % 3 === 2 ? ' · satu lagi untuk ultimate' : ''}</span>` : '') +
        (r.revived ? `<br><span class="tag">${Icon.heart}Kamu bangkit kembali</span>` : '');
      if (!quiet) setAvatar(cv, p.charId, r.ultimate ? 'ultimate' : 'attack', false, () => setAvatar(cv, p.charId, 'idle', true));
      if (!quiet && navigator.vibrate) navigator.vibrate(r.ultimate ? [60, 40, 60, 40, 120] : 60);
    } else {
      banner.textContent = r.choice == null ? 'Waktu habis' : 'Salah!';
      banner.className = 'res-banner bad';
      $('#res-points').textContent = '+0';
      $('#res-points').className = 'res-points bad';
      $('#res-detail').innerHTML = `Jawaban benar: <b class="pill opt-${r.answer}">${LETTERS[r.answer]}</b><br>` +
        (r.hit ? `Kamu terkena serangan musuh (−${r.hit} HP).` : '') + (r.koNow ? `<br><span class="tag">${Icon.skull}Kamu pingsan — jawab benar untuk bangkit</span>` : '');
      if (!quiet) setAvatar(cv, p.charId, 'hit', false, () => setAvatar(cv, p.charId, 'idle', true));
      if (!quiet && navigator.vibrate) navigator.vibrate([200]);
    }
    const a = avatars.get(cv); if (a) a.ko = !!r.koNow;
    showView('v-result');
  }

  function finalView(v) {
    if (!v) return;
    clearInterval(timerInt);
    const p = v.me;
    $('#final-banner').textContent = v.victory ? 'Kemenangan' : 'Party mundur';
    $('#final-banner').className = 'res-banner ' + (v.victory ? 'good' : 'bad');
    $('#final-rank').innerHTML = `${p.rank}<small style="font-size:1rem;color:var(--dim)"> / ${p.total}</small>`;
    const total = v.totalQuestions || 0;
    $('#final-stats').innerHTML = `<div><b>${p.score}</b><span>poin</span></div><div><b>${p.correct}/${total}</b><span>benar</span></div><div><b>${total ? Math.round((100 * p.correct) / total) : 0}%</b><span>akurasi</span></div>`;
    setAvatar($('#cv-final'), p.charId, v.victory ? 'ultimate' : 'idle', !v.victory, () => setAvatar($('#cv-final'), p.charId, 'idle', true));
    showView('v-final');
  }

  $('#btn-leave').onclick = () => {
    try { localStorage.removeItem(storeKey(code)); } catch (e) { /* abaikan */ }
    location.href = '/play';
  };

  function message(_icon, title, text) {
    $('#msg-title').textContent = title; $('#msg-text').textContent = text;
    show('s-msg');
  }
  socket.on('p:kicked', () => {
    try { localStorage.removeItem(storeKey(code)); } catch (e) { /* abaikan */ }
    me = null;
    message(null, 'Kamu dikeluarkan dari party', 'Guru mengeluarkanmu dari ruang ini.');
  });
  socket.on('p:closed', () => {
    try { localStorage.removeItem(storeKey(code)); } catch (e) { /* abaikan */ }
    const fin = lastState && lastState.state === 'finished';
    if (!fin) message(null, 'Ruang ditutup', 'Guru telah mengakhiri petualangan. Terima kasih sudah bermain!');
  });
  socket.on('p:replaced', () => message(null, 'Dibuka di perangkat lain', 'Akunmu sedang dipakai di tab/perangkat lain.'));

  // ---------------------------------------------------------- koneksi
  socket.on('disconnect', () => { $('#conn').hidden = false; });
  socket.on('connect', () => {
    $('#conn').hidden = true;
    if (me && me.playerToken) join(me.name, me.charId, me.playerToken, true);
    else if (code) checkRoom();
    else show('s-code');
  });
  if (!code) show('s-code');
})();
