// Latar belakang pertarungan prosedural (parallax, bisa digulir saat party berjalan).
(function () {
  const W = 1920, H = 1080, GROUND = 560;
  const TAU = Math.PI * 2;

  function rng(seed) {
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }
  // Fungsi tinggi periodik (mulus & bisa diulang setiap W piksel)
  function ridge(seed, amp, base, harmonics = 6) {
    const r = rng(seed);
    const hs = [];
    for (let i = 1; i <= harmonics; i++) hs.push({ k: i + Math.floor(r() * 3), a: amp * r() / i, p: r() * TAU });
    return (x) => base - hs.reduce((s, h) => s + h.a * Math.sin((x / W) * TAU * h.k + h.p), 0);
  }

  function layer(draw) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    draw(c.getContext('2d'));
    return c;
  }

  function fillRidge(ctx, f, color, step = 8) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += step) ctx.lineTo(x, f(x));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }

  function pine(ctx, x, y, h, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
      const w = h * (0.42 - i * 0.07), yy = y - h * (0.18 + i * 0.22);
      ctx.beginPath(); ctx.moveTo(x - w, yy + h * 0.25); ctx.lineTo(x, yy - h * 0.2); ctx.lineTo(x + w, yy + h * 0.25); ctx.fill();
    }
    ctx.fillRect(x - h * 0.04, y - h * 0.2, h * 0.08, h * 0.2);
  }

  function wrapDraw(ctx, x, fn) {
    fn(x); if (x < 200) fn(x + W); if (x > W - 200) fn(x - W);
  }

  function groundGrad(ctx, top, bottom) {
    const g = ctx.createLinearGradient(0, GROUND, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, GROUND, W, H - GROUND);
  }

  function sky(ctx, stops, stars = 0, seed = 1) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND + 60);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const r = rng(seed);
    for (let i = 0; i < stars; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
      const s = r() * 2.2 + 0.4;
      ctx.fillRect(r() * W, r() * GROUND * 0.8, s, s);
    }
  }

  function moon(ctx, x, y, r, color, glowCol) {
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 4);
    g.addColorStop(0, glowCol); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, TAU); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  const THEMES = {
    // Stage 1: Hutan Terkutuk saat senja
    forest() {
      return {
        sky: layer((c) => {
          sky(c, [[0, '#1a1036'], [0.55, '#5b2a6e'], [0.85, '#e0725a'], [1, '#ffb070']], 120, 3);
          moon(c, 1500, 170, 60, '#ffe9c4', 'rgba(255,200,150,0.25)');
        }),
        far: layer((c) => {
          fillRidge(c, ridge(11, 120, 430), '#3b2458');
          fillRidge(c, ridge(12, 90, 480), '#2c1b45');
        }),
        mid: layer((c) => {
          const r = rng(21);
          for (let i = 0; i < 26; i++) {
            const x = (i / 26) * W + r() * 40, h = 180 + r() * 160;
            wrapDraw(c, x, (xx) => pine(c, xx, GROUND + 25, h, '#15222a'));
          }
        }),
        ground: layer((c) => {
          groundGrad(c, '#2f4b2c', '#0f1a0e');
          c.fillStyle = 'rgba(120,90,60,0.35)';
          c.beginPath(); c.ellipse(W / 2, GROUND + 260, 1100, 120, 0, 0, TAU); c.fill();
          const r = rng(5);
          for (let i = 0; i < 380; i++) {
            const x = r() * W, y = GROUND + r() * (H - GROUND);
            c.strokeStyle = `rgba(${60 + r() * 50},${110 + r() * 60},${50 + r() * 30},0.6)`;
            c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 8, y - 8 - r() * 10); c.stroke();
          }
        }),
        particles: 'fireflies',
      };
    },
    // Stage 2: Makam kuno
    graveyard() {
      return {
        sky: layer((c) => {
          sky(c, [[0, '#050a1c'], [0.7, '#1d2b58'], [1, '#3c4d7e']], 220, 7);
          moon(c, 420, 200, 95, '#e8eefc', 'rgba(170,200,255,0.25)');
        }),
        far: layer((c) => {
          fillRidge(c, ridge(31, 60, 470), '#18203d');
          // reruntuhan kastil
          c.fillStyle = '#121a33';
          for (const [x, w, h] of [[1200, 60, 260], [1270, 140, 170], [1420, 50, 300], [1480, 120, 150], [300, 80, 200], [900, 40, 230]]) {
            c.fillRect(x, 480 - h, w, h + 20);
            for (let k = 0; k < w; k += 20) c.fillRect(x + k, 470 - h, 12, 14);
          }
        }),
        mid: layer((c) => {
          const r = rng(41);
          for (let i = 0; i < 16; i++) {
            const x = r() * W, h = 50 + r() * 50, w = 30 + r() * 25;
            wrapDraw(c, x, (xx) => {
              c.fillStyle = '#20263a';
              c.beginPath(); c.moveTo(xx - w / 2, GROUND + 20); c.lineTo(xx - w / 2, GROUND + 20 - h); c.arc(xx, GROUND + 20 - h, w / 2, Math.PI, 0); c.lineTo(xx + w / 2, GROUND + 20); c.fill();
              c.fillStyle = '#2d3550'; c.fillRect(xx - 3, GROUND - h + 5, 6, 26); c.fillRect(xx - 11, GROUND - h + 12, 22, 6);
            });
          }
          // pohon mati
          c.strokeStyle = '#0d1120'; c.lineCap = 'round';
          for (const x of [150, 980, 1750]) {
            c.lineWidth = 22; c.beginPath(); c.moveTo(x, GROUND + 30); c.lineTo(x + 10, GROUND - 220); c.stroke();
            c.lineWidth = 9;
            for (const [dx, dy] of [[-90, -300], [80, -320], [-60, -180], [100, -230]]) { c.beginPath(); c.moveTo(x + 8, GROUND - 150); c.quadraticCurveTo(x + dx / 2, GROUND + dy / 1.5, x + dx, GROUND + dy); c.stroke(); }
          }
        }),
        ground: layer((c) => {
          groundGrad(c, '#2c2f3e', '#0c0d14');
          const r = rng(9);
          for (let i = 0; i < 90; i++) {
            c.fillStyle = `rgba(80,85,110,${0.2 + r() * 0.3})`;
            c.beginPath(); c.ellipse(r() * W, GROUND + 20 + r() * 480, 10 + r() * 30, 4 + r() * 8, 0, 0, TAU); c.fill();
          }
        }),
        particles: 'fog',
      };
    },
    // Stage 3: Ngarai gunung berapi
    volcano() {
      return {
        sky: layer((c) => {
          sky(c, [[0, '#1a0303'], [0.6, '#5c1208'], [1, '#d4501e']], 0, 2);
          const g = c.createRadialGradient(1300, 380, 20, 1300, 380, 500);
          g.addColorStop(0, 'rgba(255,140,40,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        }),
        far: layer((c) => {
          fillRidge(c, ridge(51, 80, 480), '#2a0a06');
          c.fillStyle = '#1f0704';
          c.beginPath(); c.moveTo(900, 520); c.lineTo(1220, 230); c.lineTo(1380, 230); c.lineTo(1700, 520); c.fill();
          c.strokeStyle = '#ff6a1a'; c.lineWidth = 6; c.shadowColor = '#ff6a1a'; c.shadowBlur = 20;
          c.beginPath(); c.moveTo(1240, 236); c.lineTo(1260, 320); c.lineTo(1240, 400); c.moveTo(1340, 236); c.lineTo(1330, 300); c.lineTo(1360, 380); c.stroke();
          c.shadowBlur = 0;
        }),
        mid: layer((c) => {
          const r = rng(61);
          for (let i = 0; i < 14; i++) {
            const x = r() * W, h = 80 + r() * 160, w = 60 + r() * 90;
            wrapDraw(c, x, (xx) => {
              c.fillStyle = '#170604';
              c.beginPath(); c.moveTo(xx - w, GROUND + 30); c.lineTo(xx - w * 0.3, GROUND - h); c.lineTo(xx + w * 0.2, GROUND - h * 0.7); c.lineTo(xx + w, GROUND + 30); c.fill();
            });
          }
        }),
        ground: layer((c) => {
          groundGrad(c, '#3b1a12', '#120604');
          c.strokeStyle = '#ff5a14'; c.lineWidth = 4; c.shadowColor = '#ff7a1a'; c.shadowBlur = 16;
          const r = rng(14);
          for (let i = 0; i < 14; i++) {
            let x = r() * W, y = GROUND + 40 + r() * 440;
            c.beginPath(); c.moveTo(x, y);
            for (let k = 0; k < 5; k++) { x += 20 + r() * 40; y += (r() - 0.5) * 30; c.lineTo(x, y); }
            c.stroke();
          }
          c.shadowBlur = 0;
        }),
        particles: 'embers',
      };
    },
    // Stage 4: Istana Raja Iblis
    castle(phase2) {
      return {
        sky: layer((c) => {
          if (phase2) sky(c, [[0, '#1a0000'], [0.6, '#6a0a0a'], [1, '#d4301a']], 40, 4);
          else sky(c, [[0, '#08020f'], [0.6, '#2c0b45'], [1, '#6b1f7a']], 160, 4);
          moon(c, 960, 210, 110, phase2 ? '#ff3b2b' : '#ff5c7a', phase2 ? 'rgba(255,40,20,0.35)' : 'rgba(255,60,120,0.25)');
        }),
        far: layer((c) => {
          const col = phase2 ? '#1a0303' : '#0d0516';
          c.fillStyle = col;
          c.fillRect(560, 300, 800, 260);
          for (const [x, w, h] of [[600, 90, 380], [760, 70, 300], [880, 160, 470], [1080, 70, 320], [1220, 100, 400]]) {
            c.fillRect(x, 560 - h, w, h);
            c.beginPath(); c.moveTo(x - 15, 560 - h); c.lineTo(x + w / 2, 560 - h - 120); c.lineTo(x + w + 15, 560 - h); c.fill();
          }
          c.fillStyle = phase2 ? '#ff7a1a' : '#e879f9';
          const r = rng(77);
          for (let i = 0; i < 40; i++) if (r() > 0.4) c.fillRect(600 + r() * 720, 200 + r() * 330, 6, 12);
          fillRidge(c, ridge(71, 40, 520), phase2 ? '#140202' : '#0a0410');
        }),
        mid: layer((c) => {
          for (const x of [120, 520, 1400, 1800]) {
            c.fillStyle = phase2 ? '#220707' : '#150a22';
            c.fillRect(x - 40, GROUND - 330, 80, 370);
            c.fillRect(x - 60, GROUND - 350, 120, 30);
            c.fillStyle = phase2 ? '#ff5a1a' : '#a855f7';
            c.globalAlpha = 0.6; c.fillRect(x - 8, GROUND - 300, 16, 40); c.globalAlpha = 1;
          }
        }),
        ground: layer((c) => {
          groundGrad(c, phase2 ? '#2a0c0c' : '#231633', phase2 ? '#0a0202' : '#07030c');
          c.strokeStyle = phase2 ? 'rgba(255,90,30,0.25)' : 'rgba(168,85,247,0.18)'; c.lineWidth = 2;
          for (let y = GROUND + 30, k = 0; y < H; y += 40 + k * 8, k++) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
          for (let x = -400; x < W + 400; x += 140) { c.beginPath(); c.moveTo(W / 2 + (x - W / 2) * 0.4, GROUND); c.lineTo(x, H); c.stroke(); }
          // karpet merah ke singgasana
          c.fillStyle = phase2 ? 'rgba(120,10,10,0.5)' : 'rgba(120,10,40,0.45)';
          c.beginPath(); c.moveTo(W / 2 - 90, GROUND); c.lineTo(W / 2 + 90, GROUND); c.lineTo(W / 2 + 420, H); c.lineTo(W / 2 - 420, H); c.fill();
        }),
        particles: phase2 ? 'hellfire' : 'mist',
      };
    },
  };

  // Latar dari gambar (tools/prepare_backgrounds.py). Kunci: "stage:fase".
  // Stage tanpa gambar memakai latar prosedural di atas.
  const IMAGE_STAGES = {
    '1:1': { bg: '/assets/backgrounds/stage1_bg.webp', fg: '/assets/backgrounds/stage1_fg.webp', fgY: 70, particles: 'fog' },
    '2:1': { bg: '/assets/backgrounds/stage2_bg.webp', fg: '/assets/backgrounds/stage2_fg.webp', fgY: 70, particles: 'mist' },
    '3:1': { bg: '/assets/backgrounds/stage3_bg.webp', fg: '/assets/backgrounds/stage3_fg.webp', fgY: 70, particles: 'embers' },
    '3:2': { bg: '/assets/backgrounds/stage3_bg.webp', fg: '/assets/backgrounds/stage3_fg.webp', fgY: 70, particles: 'hellfire' },
  };
  const images = {};
  function img(src) {
    if (!images[src]) {
      const im = new Image();
      im.src = src;
      images[src] = im;
    }
    const im = images[src];
    return im.complete && im.naturalWidth ? im : null;
  }
  Object.values(IMAGE_STAGES).forEach((c) => { img(c.bg); if (c.fg) img(c.fg); });
  function imageStage(stage, phase) { return IMAGE_STAGES[stage + ':' + (stage >= 3 ? phase : 1)]; }

  const STAGE_THEME = { 1: 'forest', 2: 'graveyard', 3: 'volcano', 4: 'castle' };
  const cache = {};

  function get(stage, phase) {
    const key = stage + ':' + (stage >= 3 ? phase : 1);
    if (!cache[key]) {
      const name = STAGE_THEME[stage] || 'forest';
      cache[key] = THEMES[name](phase === 2);
      cache[key].seed = stage * 13 + phase;
    }
    return cache[key];
  }

  function drawLayer(ctx, img, offset) {
    const o = ((offset % W) + W) % W;
    ctx.drawImage(img, -o, 0);
    ctx.drawImage(img, W - o, 0);
  }

  function particles(ctx, kind, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = kind === 'fog' || kind === 'mist' ? 14 : 60;
    for (let i = 0; i < n; i++) {
      const s1 = Math.sin(i * 12.9898) * 43758.5453, r1 = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 78.233) * 12345.678, r2 = s2 - Math.floor(s2);
      if (kind === 'fireflies') {
        const x = (r1 * W + Math.sin(t * 0.5 + i) * 40) % W, y = 200 + r2 * 700 + Math.cos(t * 0.7 + i) * 30;
        const a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + i * 3));
        const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
        g.addColorStop(0, `rgba(220,255,140,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 12, y - 12, 24, 24);
      } else if (kind === 'embers' || kind === 'hellfire') {
        const p = (t * (0.06 + r2 * 0.08) + r1) % 1;
        const x = (r1 * W + Math.sin(t + i) * 30), y = H - p * H * 1.1;
        const sz = 2 + r2 * 4;
        ctx.fillStyle = `rgba(255,${120 + r2 * 100 | 0},40,${0.8 * (1 - p)})`;
        ctx.fillRect(x, y, sz, sz);
      } else {
        const x = ((r1 * W + t * (15 + r2 * 25)) % (W + 600)) - 300, y = GROUND - 40 + r2 * 420;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 260);
        const col = kind === 'mist' ? '150,80,220' : '170,190,230';
        g.addColorStop(0, `rgba(${col},0.10)`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 260, y - 260, 520, 520);
      }
    }
    ctx.restore();
  }

  // scroll: jarak jalan party (px). flash: kilat (0..1) untuk fase 2
  function draw(ctx, stage, phase, t, scroll = 0, flash = 0) {
    const im = imageStage(stage, phase);
    const bgImg = im && img(im.bg);
    if (bgImg) {
      // gambar 10% lebih lebar agar bisa digeser saat party berjalan
      const pan = Math.min(W * 0.1, scroll * 0.2);
      ctx.drawImage(bgImg, -pan, -H * 0.05, W * 1.1, H * 1.1);
      particles(ctx, im.particles, t);
      return;
    }
    const th = get(stage, phase);
    ctx.drawImage(th.sky, 0, 0);
    drawLayer(ctx, th.far, scroll * 0.15);
    drawLayer(ctx, th.mid, scroll * 0.45);
    drawLayer(ctx, th.ground, scroll * 1.0);
    particles(ctx, th.particles, t);
    if (th.particles === 'hellfire') {
      const l = Math.max(flash, Math.pow(Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 2.3)), 12));
      if (l > 0.02) { ctx.fillStyle = `rgba(255,220,200,${0.35 * l})`; ctx.fillRect(0, 0, W, H); }
    }
  }

  // Latar depan (batu/tanaman) di depan karakter. Digeser lebih cepat (parallax).
  function drawFront(ctx, stage, phase, scroll = 0) {
    const im = imageStage(stage, phase);
    const fgImg = im && im.fg && img(im.fg);
    if (!fgImg) return;
    const pan = Math.min(W * 0.1, scroll * 0.4);
    ctx.drawImage(fgImg, -pan, im.fgY || 0, W * 1.1, H * 1.1);
  }

  window.Backgrounds = { draw, drawFront, W, H, GROUND, preload: get };
})();
