// Editor bank soal untuk guru (disimpan di localStorage browser guru).
(function () {
  const KEY = 'rpg_questions_v1';
  const SET_KEY = 'rpg_settings_v1';
  const LETTERS = ['A', 'B', 'C', 'D'];
  let questions = [];

  const $ = (s) => document.querySelector(s);

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(raw) && raw.length) return raw;
    } catch (e) { /* abaikan */ }
    return JSON.parse(JSON.stringify(window.DEFAULT_QUESTIONS));
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(questions)); } catch (e) { /* abaikan */ }
    updateCount();
  }

  function blank() { return { q: '', options: ['', '', '', ''], answer: 0 }; }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function render() {
    const list = $('#q-list');
    list.innerHTML = questions.map((q, i) => `
      <div class="q-item" data-i="${i}">
        <div class="q-item-head">
          <span class="q-no">${i + 1}</span>
          <textarea class="q-q" rows="2" placeholder="Tulis pertanyaan…">${esc(q.q)}</textarea>
          <div class="q-tools">
            <button class="icon" data-act="up" title="Naik">▲</button>
            <button class="icon" data-act="down" title="Turun">▼</button>
            <button class="icon danger" data-act="del" title="Hapus">🗑</button>
          </div>
        </div>
        <div class="q-opts">
          ${q.options.map((o, k) => `
            <label class="q-opt opt-${k}${q.answer === k ? ' is-answer' : ''}">
              <input type="radio" name="ans-${i}" value="${k}" ${q.answer === k ? 'checked' : ''} title="Tandai sebagai jawaban benar">
              <b>${LETTERS[k]}</b>
              <input class="q-o" data-k="${k}" value="${esc(o)}" placeholder="Pilihan ${LETTERS[k]}">
            </label>`).join('')}
        </div>
      </div>`).join('');
    updateCount();
  }

  function updateCount() {
    $('#q-count').textContent = `(${questions.length} soal)`;
    const plan = planPhases(questions.length);
    const names = GameData.PHASES.map((p) => p.name);
    $('#plan').innerHTML = questions.length >= GameData.PHASES.length
      ? '<h3>Pembagian soal per musuh</h3>' + plan.map((p, i) => `<div class="plan-row"><span>${i + 1}. ${names[i]}</span><b>${p} soal</b></div>`).join('')
      : `<p class="hint warn">Minimal ${GameData.PHASES.length} soal.</p>`;
  }

  // Salinan sisi-klien dari planPhases di server (hanya untuk tampilan)
  function planPhases(total) {
    const ph = GameData.PHASES, n = ph.length;
    if (total < n) return ph.map(() => 0);
    const counts = new Array(n).fill(1);
    let left = total - n;
    const wsum = ph.reduce((s, p) => s + p.weight, 0);
    const exact = ph.map((p) => (p.weight / wsum) * left);
    exact.forEach((e, i) => { counts[i] += Math.floor(e); });
    left -= exact.reduce((s, e) => s + Math.floor(e), 0);
    const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < left; k++) counts[order[k % n][1]]++;
    return counts;
  }

  // Parser teks bebas: blok dipisah baris kosong, pilihan "A." / "a)" / "A:", jawaban "*" atau "Jawaban: X"
  function parseText(text) {
    const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const out = [], errors = [];
    blocks.forEach((b, bi) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
      const q = { q: '', options: ['', '', '', ''], answer: -1 };
      const qLines = [];
      for (const l of lines) {
        const m = l.match(/^([A-Da-d])\s*[.):\-]\s*(.*)$/);
        const ans = l.match(/^(jawaban|kunci|answer)\s*[:=]?\s*([A-Da-d])\b/i);
        if (ans) { q.answer = 'ABCD'.indexOf(ans[2].toUpperCase()); continue; }
        if (m) {
          const k = 'ABCD'.indexOf(m[1].toUpperCase());
          let t = m[2];
          if (/\*\s*$/.test(t)) { t = t.replace(/\s*\*\s*$/, ''); q.answer = k; }
          q.options[k] = t;
        } else qLines.push(l);
      }
      q.q = qLines.join(' ').replace(/^\d+\s*[.)]\s*/, '');
      if (!q.q || q.options.some((o) => !o) || q.answer < 0) errors.push(bi + 1);
      else out.push(q);
    });
    return { questions: out, errors };
  }

  function bind() {
    const list = $('#q-list');
    list.addEventListener('input', (e) => {
      const item = e.target.closest('.q-item'); if (!item) return;
      const q = questions[+item.dataset.i];
      if (e.target.classList.contains('q-q')) q.q = e.target.value;
      if (e.target.classList.contains('q-o')) q.options[+e.target.dataset.k] = e.target.value;
      save();
    });
    list.addEventListener('change', (e) => {
      if (e.target.type !== 'radio') return;
      const item = e.target.closest('.q-item');
      questions[+item.dataset.i].answer = +e.target.value;
      item.querySelectorAll('.q-opt').forEach((el, k) => el.classList.toggle('is-answer', k === +e.target.value));
      save();
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const i = +b.closest('.q-item').dataset.i;
      if (b.dataset.act === 'del') { if (confirm(`Hapus soal ${i + 1}?`)) questions.splice(i, 1); }
      if (b.dataset.act === 'up' && i > 0) [questions[i - 1], questions[i]] = [questions[i], questions[i - 1]];
      if (b.dataset.act === 'down' && i < questions.length - 1) [questions[i + 1], questions[i]] = [questions[i], questions[i + 1]];
      save(); render();
    });
    $('#btn-add').onclick = () => {
      questions.push(blank()); save(); render();
      const last = list.lastElementChild; last.scrollIntoView({ behavior: 'smooth', block: 'center' }); last.querySelector('.q-q').focus();
    };
    $('#btn-reset').onclick = () => {
      if (!confirm('Ganti semua soal dengan contoh soal bawaan?')) return;
      questions = JSON.parse(JSON.stringify(window.DEFAULT_QUESTIONS)); save(); render();
    };
    $('#btn-export').onclick = () => {
      const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (($('#set-title').value || 'bank-soal').replace(/[^\w\- ]+/g, '').trim() || 'bank-soal') + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $('#btn-import').onclick = () => $('#file-import').click();
    $('#file-import').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const arr = Array.isArray(data) ? data : data.questions;
        const clean = arr.map((q) => ({ q: String(q.q || q.question || ''), options: (q.options || q.choices || []).slice(0, 4).map(String), answer: typeof q.answer === 'number' ? q.answer : 'ABCD'.indexOf(String(q.answer).toUpperCase()) }));
        clean.forEach((q) => { while (q.options.length < 4) q.options.push(''); });
        questions = clean; save(); render();
        alert(`${clean.length} soal berhasil diimpor.`);
      } catch (err) { alert('File JSON tidak valid: ' + err.message); }
      e.target.value = '';
    };
    const dlg = $('#paste-dialog');
    $('#btn-paste').onclick = () => { $('#paste-msg').textContent = ''; dlg.showModal(); };
    $('#paste-ok').onclick = (e) => {
      const r = parseText($('#paste-text').value);
      if (!r.questions.length) { e.preventDefault(); $('#paste-msg').textContent = 'Tidak ada soal yang terbaca. Periksa formatnya.'; return; }
      if (r.errors.length) {
        if (!confirm(`${r.questions.length} soal terbaca. Blok ke-${r.errors.join(', ')} tidak lengkap dan dilewati. Lanjutkan?`)) { e.preventDefault(); return; }
      }
      questions = $('#paste-replace').checked ? r.questions : questions.concat(r.questions);
      $('#paste-text').value = '';
      save(); render();
    };

    // pengaturan
    try {
      const s = JSON.parse(localStorage.getItem(SET_KEY)) || {};
      if (s.title) $('#set-title').value = s.title;
      if (s.time) $('#set-time').value = s.time;
      $('#set-shuffle').checked = !!s.shuffle;
    } catch (e) { /* abaikan */ }
    ['#set-title', '#set-time', '#set-shuffle'].forEach((id) => $(id).addEventListener('change', saveSettings));
  }

  function saveSettings() {
    try { localStorage.setItem(SET_KEY, JSON.stringify(settings())); } catch (e) { /* abaikan */ }
  }

  function settings() {
    return { title: $('#set-title').value.trim(), time: +$('#set-time').value, shuffle: $('#set-shuffle').checked };
  }

  // Validasi sederhana sebelum dikirim ke server
  function validate() {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.q.trim()) return `Soal ${i + 1}: pertanyaan masih kosong`;
      const k = q.options.findIndex((o) => !String(o).trim());
      if (k >= 0) return `Soal ${i + 1}: pilihan ${LETTERS[k]} masih kosong`;
    }
    if (questions.length < GameData.PHASES.length) return `Minimal ${GameData.PHASES.length} soal`;
    return null;
  }

  function init() { questions = load(); bind(); render(); }

  window.Editor = { init, get questions() { return questions; }, settings, validate, parseText };
})();
