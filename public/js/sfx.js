// Efek suara sintetis (WebAudio) — tanpa file audio eksternal.
(function () {
  let ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem('rpg_muted') === '1'; } catch (e) { /* abaikan */ }

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuf(c) {
    if (c._noise) return c._noise;
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    c._noise = b;
    return b;
  }

  function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005 } = {}) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, { vol = 0.3, freq = 1200, q = 0.8, type = 'bandpass', delay = 0, sweep = 0 } = {}) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = noiseBuf(c);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  const S = {
    click() { tone(660, 0.08, { type: 'triangle', vol: 0.2 }); },
    join() { tone(523, 0.12, { type: 'triangle' }); tone(784, 0.18, { type: 'triangle', delay: 0.1 }); },
    tick() { tone(1200, 0.05, { type: 'square', vol: 0.06 }); },
    question() { [392, 523, 659].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.2, delay: i * 0.08 })); },
    slash() { noise(0.18, { freq: 3000, sweep: 0.3, vol: 0.35 }); },
    fire() { noise(0.4, { freq: 600, sweep: 2.5, vol: 0.35, type: 'lowpass' }); tone(180, 0.3, { type: 'sawtooth', vol: 0.08, slide: 0.5 }); },
    arrow() { noise(0.12, { freq: 5000, sweep: 0.5, vol: 0.2 }); tone(900, 0.1, { slide: 0.6, vol: 0.1 }); },
    holy() { [880, 1320, 1760].forEach((f, i) => tone(f, 0.5, { vol: 0.1, delay: i * 0.05 })); },
    impact() { noise(0.2, { freq: 400, type: 'lowpass', vol: 0.5 }); tone(110, 0.2, { type: 'square', slide: 0.4, vol: 0.15 }); },
    hurt() { tone(300, 0.18, { type: 'sawtooth', slide: 0.5, vol: 0.15 }); noise(0.15, { freq: 900, vol: 0.2 }); },
    enemyAttack() { tone(90, 0.5, { type: 'sawtooth', slide: 0.6, vol: 0.2 }); noise(0.5, { freq: 300, type: 'lowpass', vol: 0.3 }); },
    roar() { tone(70, 1.2, { type: 'sawtooth', slide: 0.7, vol: 0.3, attack: 0.1 }); noise(1.2, { freq: 250, type: 'lowpass', vol: 0.4 }); },
    ultimate() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'square', vol: 0.08, delay: i * 0.07 })); noise(0.8, { freq: 200, sweep: 8, vol: 0.2, delay: 0.3 }); },
    boom() { noise(1.0, { freq: 150, type: 'lowpass', vol: 0.7 }); tone(60, 0.8, { type: 'sine', slide: 0.4, vol: 0.5 }); },
    heal() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.12, delay: i * 0.08 })); },
    correct() { tone(784, 0.12, { type: 'triangle' }); tone(1175, 0.25, { type: 'triangle', delay: 0.1 }); },
    wrong() { tone(220, 0.3, { type: 'square', slide: 0.6, vol: 0.12 }); },
    victory() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.14 })); },
    defeat() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.2, delay: i * 0.3 })); },
    stageClear() { [523, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'square', vol: 0.1, delay: i * 0.12 })); },
    unlock() { ac(); },
    get muted() { return muted; },
    setMuted(m) { muted = m; try { localStorage.setItem('rpg_muted', m ? '1' : '0'); } catch (e) { /* abaikan */ } },
  };
  window.Sfx = S;
})();
