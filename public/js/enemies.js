// Musuh digambar secara prosedural (vektor canvas) dengan animasi.
// Titik asal (0,0) = tengah kaki musuh. Musuh menghadap ke kiri (ke arah party).
// st: { t: waktu(detik), atk: 0..1 progres serangan (0 = tidak menyerang), hit: 0..1 sisa efek terkena }
(function () {
  const TAU = Math.PI * 2;
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
  // kurva serangan umum: ancang-ancang (0..0.45) lalu ayunan (0.45..0.7) lalu kembali
  function swing(a) {
    if (a <= 0) return 0;
    if (a < 0.45) return -ease(a / 0.45);           // tarik ke belakang
    if (a < 0.7) return -1 + 2.2 * ease((a - 0.45) / 0.25); // ayun ke depan
    return 1.2 * (1 - ease((a - 0.7) / 0.3));
  }

  function glow(ctx, x, y, r, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function shadow(ctx, w) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(0, 0, w, w * 0.18, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function bone(ctx, x1, y1, x2, y2, w, col = '#e9e3cc') {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a2320'; ctx.lineWidth = w + 6;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function limb(ctx, x1, y1, x2, y2, w, fill, stroke = '#120a0a') {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = stroke; ctx.lineWidth = w + 6;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = fill; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function poly(ctx, pts, fill, stroke, lw = 4) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
  }

  function eye(ctx, x, y, r, color, angle = 0) {
    glow(ctx, x, y, r * 4, color, 0.6);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = '#fff8d0';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(-r * 0.15, 0, r * 0.55, r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ 1. SLIME
  function slime(ctx, st) {
    const t = st.t, a = st.atk || 0;
    let squash = 1 + 0.05 * Math.sin(t * 3.2);
    let jumpX = 0, jumpY = 0;
    if (a > 0) {
      if (a < 0.35) squash = 1 - 0.3 * ease(a / 0.35);
      else if (a < 0.7) { const k = (a - 0.35) / 0.35; squash = 1.25; jumpX = -160 * Math.sin(k * Math.PI); jumpY = -110 * Math.sin(k * Math.PI); }
      else squash = 1 - 0.2 * Math.sin(((a - 0.7) / 0.3) * Math.PI);
    }
    shadow(ctx, 150 * (1 - Math.abs(jumpY) / 300));
    ctx.save();
    ctx.translate(jumpX, jumpY);
    const W = 160 / Math.sqrt(squash), H = 190 * squash;
    // tubuh
    ctx.beginPath();
    ctx.moveTo(-W, 0);
    ctx.bezierCurveTo(-W * 1.05, -H * 0.55, -W * 0.55, -H * 1.02, 0, -H);
    ctx.bezierCurveTo(W * 0.6, -H * 1.02, W * 1.08, -H * 0.55, W, 0);
    // tetesan di bawah
    for (let i = 4; i >= -4; i--) {
      const x = (i / 4) * W;
      const d = 10 + 8 * Math.sin(t * 2 + i * 1.7);
      ctx.quadraticCurveTo(x + W / 8, d, x, i % 2 ? 4 : d * 0.4);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-W * 0.3, -H * 0.65, 10, 0, -H * 0.4, W * 1.3);
    g.addColorStop(0, '#c4b5fd');
    g.addColorStop(0.35, '#7c3aed');
    g.addColorStop(0.8, '#3b0764');
    g.addColorStop(1, '#1e0533');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#14021f'; ctx.stroke();
    // inti kristal merah
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    glow(ctx, 20, -H * 0.38, 70, 'rgba(255,40,80,0.9)', 0.5 + 0.3 * pulse);
    poly(ctx, [20, -H * 0.38 - 30, 40, -H * 0.38, 20, -H * 0.38 + 28, 2, -H * 0.38], '#ff3b6b', '#4a0018', 3);
    // gelembung
    ctx.fillStyle = 'rgba(221,214,254,0.35)';
    for (let i = 0; i < 6; i++) {
      const p = ((t * 0.3 + i / 6) % 1);
      const bx = Math.sin(i * 7.3) * W * 0.55, by = -p * H * 0.85;
      ctx.beginPath(); ctx.arc(bx, by, 4 + (i % 3) * 3, 0, TAU); ctx.fill();
    }
    // kilau
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-W * 0.45, -H * 0.72, W * 0.18, H * 0.08, -0.6, 0, TAU); ctx.fill();
    // tanduk kecil
    poly(ctx, [-W * 0.45, -H * 0.86, -W * 0.62, -H * 1.18, -W * 0.25, -H * 0.95], '#1b1029', '#0b0612', 4);
    poly(ctx, [W * 0.15, -H * 0.97, W * 0.2, -H * 1.28, W * 0.42, -H * 0.9], '#1b1029', '#0b0612', 4);
    // mata marah
    eye(ctx, -W * 0.48, -H * 0.62, 16, '#ffdd33', 0.35);
    eye(ctx, -W * 0.05, -H * 0.64, 14, '#ffdd33', -0.35);
    // mulut bertaring
    const open = a > 0.3 && a < 0.8 ? 1 : 0.35 + 0.1 * Math.sin(t * 5);
    ctx.fillStyle = '#12001c';
    ctx.beginPath();
    ctx.moveTo(-W * 0.62, -H * 0.42);
    ctx.quadraticCurveTo(-W * 0.3, -H * (0.42 - 0.2 * open), W * 0.05, -H * 0.44);
    ctx.quadraticCurveTo(-W * 0.3, -H * (0.38 + 0.06 * open), -W * 0.62, -H * 0.42);
    ctx.fill();
    ctx.fillStyle = '#f5f0e0';
    for (let i = 0; i < 5; i++) {
      const x = -W * 0.55 + i * W * 0.13;
      poly(ctx, [x, -H * 0.425, x + 9, -H * 0.425, x + 4.5, -H * (0.425 - 0.05 - 0.04 * open)], '#f5f0e0');
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ 2. KSATRIA TENGKORAK
  function skeleton(ctx, st) {
    const t = st.t, a = st.atk || 0;
    const bob = Math.sin(t * 2.4) * 4;
    const sw = swing(a);
    shadow(ctx, 130);
    // jubah compang-camping di belakang
    ctx.save();
    ctx.translate(0, bob);
    const capeSway = Math.sin(t * 1.8) * 12;
    ctx.beginPath();
    ctx.moveTo(-40, -330);
    ctx.lineTo(70, -330);
    ctx.quadraticCurveTo(130 + capeSway, -180, 120 + capeSway, -40);
    for (let i = 0; i < 6; i++) ctx.lineTo(120 + capeSway - i * 30, -40 + (i % 2 ? -30 : 10));
    ctx.quadraticCurveTo(-10, -180, -40, -330);
    ctx.fillStyle = '#2b1838'; ctx.fill();
    ctx.strokeStyle = '#0f0715'; ctx.lineWidth = 5; ctx.stroke();
    // kaki
    bone(ctx, 10, -175, -30, -95, 16); bone(ctx, -30, -95, -40, -10, 14);
    bone(ctx, 40, -175, 60, -95, 16); bone(ctx, 60, -95, 55, -10, 14);
    poly(ctx, [-70, -10, -20, -10, -15, 0, -75, 0], '#4b4f5c', '#15161b', 4);
    poly(ctx, [30, -10, 80, -10, 85, 0, 25, 0], '#4b4f5c', '#15161b', 4);
    // pelindung lutut
    ctx.fillStyle = '#5d6270'; ctx.strokeStyle = '#15161b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(-30, -95, 16, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(60, -95, 16, 0, TAU); ctx.fill(); ctx.stroke();
    // panggul & tulang belakang
    poly(ctx, [-10, -190, 65, -190, 55, -160, 0, -160], '#d9d2b8', '#2a2320', 4);
    bone(ctx, 28, -190, 28, -250, 12);
    // tangan belakang + perisai
    bone(ctx, 75, -300, 95, -230, 13);
    ctx.save();
    ctx.translate(100, -230);
    poly(ctx, [-40, -70, 40, -70, 45, 10, 0, 70, -45, 10], '#3f4452', '#121318', 6);
    poly(ctx, [-25, -52, 25, -52, 28, 4, 0, 44, -28, 4], '#5b2238', null);
    ctx.strokeStyle = '#a3a9b8'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(0, 40); ctx.moveTo(-24, -10); ctx.lineTo(24, -10); ctx.stroke();
    ctx.restore();
    // tulang rusuk
    ctx.fillStyle = 'rgba(10,6,14,0.85)';
    ctx.beginPath(); ctx.ellipse(28, -285, 58, 62, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const y = -320 + i * 22;
      ctx.strokeStyle = '#2a2320'; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(28, y, 50 - i * 5, 14, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      ctx.strokeStyle = '#e9e3cc'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.ellipse(28, y, 50 - i * 5, 14, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
    }
    bone(ctx, 28, -340, 28, -250, 10);
    // pelindung bahu
    poly(ctx, [-35, -345, 20, -350, 10, -310, -45, -305], '#5d6270', '#15161b', 5);
    poly(ctx, [40, -350, 95, -345, 100, -305, 50, -310], '#5d6270', '#15161b', 5);
    // tengkorak + helm
    const hx = 15, hy = -400 + Math.sin(t * 2.4 + 0.5) * 3;
    ctx.fillStyle = '#e9e3cc'; ctx.strokeStyle = '#2a2320'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(hx, hy, 42, 46, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // rahang berderak
    const jaw = 6 + Math.abs(Math.sin(t * 7)) * (a > 0.3 ? 14 : 4);
    poly(ctx, [hx - 34, hy + 22, hx + 26, hy + 22, hx + 20, hy + 40 + jaw, hx - 30, hy + 40 + jaw], '#ddd6bd', '#2a2320', 4);
    ctx.fillStyle = '#2a2320';
    for (let i = 0; i < 5; i++) ctx.fillRect(hx - 28 + i * 11, hy + 24, 3, 10);
    // helm bertanduk
    ctx.beginPath();
    ctx.moveTo(hx - 50, hy - 4); ctx.quadraticCurveTo(hx, hy - 75, hx + 50, hy - 4);
    ctx.lineTo(hx + 44, hy + 6); ctx.lineTo(hx - 46, hy + 6); ctx.closePath();
    ctx.fillStyle = '#4a4e5c'; ctx.fill(); ctx.strokeStyle = '#15161b'; ctx.lineWidth = 5; ctx.stroke();
    poly(ctx, [hx - 40, hy - 30, hx - 85, hy - 80, hx - 70, hy - 95, hx - 30, hy - 48], '#cfc7ad', '#2a2320', 4);
    poly(ctx, [hx + 36, hy - 34, hx + 70, hy - 90, hx + 85, hy - 80, hx + 46, hy - 26], '#cfc7ad', '#2a2320', 4);
    // rongga mata menyala biru
    ctx.fillStyle = '#0b0a10';
    ctx.beginPath(); ctx.ellipse(hx - 18, hy + 6, 11, 12, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 12, hy + 6, 10, 11, 0, 0, TAU); ctx.fill();
    const fl = 0.75 + 0.25 * Math.sin(t * 9);
    glow(ctx, hx - 18, hy + 6, 26, 'rgba(80,200,255,1)', fl);
    glow(ctx, hx + 12, hy + 6, 22, 'rgba(80,200,255,1)', fl);
    // tangan depan + pedang (berputar saat menyerang)
    const shoulder = [-20, -330];
    const ang = -0.6 + sw * 1.5; // radian
    const ex = shoulder[0] + Math.cos(Math.PI * 0.6 + ang) * 70, ey = shoulder[1] + Math.sin(Math.PI * 0.6 + ang) * 70;
    bone(ctx, shoulder[0], shoulder[1], ex, ey, 13);
    const hxx = ex - 50, hyy = ey + 10;
    bone(ctx, ex, ey, hxx, hyy, 11);
    ctx.save();
    ctx.translate(hxx, hyy);
    ctx.rotate(-1.9 + sw * 1.6);
    poly(ctx, [-8, -10, 8, -10, 12, -230, 0, -262, -12, -230], '#8d8f99', '#1c1d22', 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -240); ctx.stroke();
    poly(ctx, [-34, -14, 34, -14, 30, 0, -30, 0], '#6b4a2b', '#1c1d22', 4);
    poly(ctx, [-6, 0, 6, 0, 6, 40, -6, 40], '#3a2618', '#1c1d22', 3);
    if (a > 0.45 && a < 0.75) glow(ctx, 0, -130, 140, 'rgba(120,200,255,0.8)', 0.5);
    ctx.restore();
    ctx.restore();
  }

  // ------------------------------------------------------------------ 3. JENDERAL IBLIS
  function general(ctx, st) {
    const t = st.t, a = st.atk || 0;
    const sw = swing(a);
    const breath = Math.sin(t * 2) * 5;
    const flap = Math.sin(t * 2.6) * 0.18;
    shadow(ctx, 170);
    ctx.save();
    // sayap
    function wing(side) {
      ctx.save();
      ctx.translate(side * 30 + 40, -380 + breath);
      ctx.scale(side, 1);
      ctx.rotate(-0.15 + flap * side);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(120, -150);
      ctx.lineTo(250, -120);
      ctx.quadraticCurveTo(230, -60, 260, 10);
      ctx.quadraticCurveTo(200, -10, 190, 50);
      ctx.quadraticCurveTo(140, 20, 120, 90);
      ctx.quadraticCurveTo(80, 40, 20, 60);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -150, 200, 80);
      g.addColorStop(0, '#5a0d1a'); g.addColorStop(1, '#1d0408');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#0a0103'; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = '#2b0a10'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(120, -150);
      ctx.moveTo(120, -150); ctx.lineTo(260, 10);
      ctx.moveTo(120, -150); ctx.lineTo(190, 50);
      ctx.moveTo(120, -150); ctx.lineTo(120, 90);
      ctx.stroke();
      ctx.restore();
    }
    wing(1); wing(-1);
    // kaki
    limb(ctx, 10, -200, -30, -110, 46, '#7f1d1d'); limb(ctx, -30, -110, -40, -14, 40, '#7f1d1d');
    limb(ctx, 80, -200, 100, -110, 46, '#6b1717'); limb(ctx, 100, -110, 95, -14, 40, '#6b1717');
    poly(ctx, [-85, -20, -10, -20, -5, 0, -95, 0], '#1f1f26', '#08080b', 4);
    poly(ctx, [60, -20, 130, -20, 135, 0, 55, 0], '#1f1f26', '#08080b', 4);
    // rok zirah
    poly(ctx, [-30, -230, 120, -230, 135, -160, 80, -170, 40, -150, 0, -170, -45, -160], '#26222e', '#08080b', 5);
    // badan berotot
    ctx.save();
    ctx.translate(0, breath);
    ctx.beginPath();
    ctx.moveTo(-50, -400); ctx.quadraticCurveTo(45, -430, 140, -400);
    ctx.quadraticCurveTo(130, -300, 110, -230); ctx.lineTo(-20, -230);
    ctx.quadraticCurveTo(-55, -300, -50, -400); ctx.closePath();
    const bg = ctx.createLinearGradient(-50, -400, 140, -230);
    bg.addColorStop(0, '#b91c1c'); bg.addColorStop(1, '#5f0f0f');
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = '#1a0505'; ctx.lineWidth = 6; ctx.stroke();
    // garis otot
    ctx.strokeStyle = 'rgba(30,5,5,0.6)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(45, -395); ctx.lineTo(45, -240);
    ctx.moveTo(0, -330); ctx.quadraticCurveTo(45, -310, 95, -330);
    ctx.moveTo(10, -290); ctx.quadraticCurveTo(45, -275, 85, -290); ctx.stroke();
    // sabuk tengkorak
    poly(ctx, [-25, -245, 115, -245, 112, -222, -22, -222], '#2b2118', '#08080b', 4);
    ctx.fillStyle = '#e9e3cc'; ctx.beginPath(); ctx.arc(45, -234, 14, 0, TAU); ctx.fill();
    // bahu berduri
    for (const [x, s] of [[-50, -1], [140, 1]]) {
      ctx.save(); ctx.translate(x, -400); ctx.scale(s, 1);
      poly(ctx, [-30, 20, 40, -25, 60, 30, 10, 50], '#2a2633', '#08080b', 5);
      poly(ctx, [0, 0, -10, -55, 18, -12], '#cfc7ad', '#1c1d22', 3);
      poly(ctx, [25, -10, 30, -60, 45, -12], '#cfc7ad', '#1c1d22', 3);
      ctx.restore();
    }
    // kepala
    const hx = 30, hy = -470;
    ctx.fillStyle = '#991b1b'; ctx.strokeStyle = '#1a0505'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(hx, hy, 46, 52, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // tanduk besar
    ctx.fillStyle = '#e7dfc8';
    ctx.beginPath(); ctx.moveTo(hx - 30, hy - 35); ctx.quadraticCurveTo(hx - 110, hy - 70, hx - 90, hy - 150);
    ctx.quadraticCurveTo(hx - 70, hy - 85, hx - 10, hy - 50); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + 30, hy - 38); ctx.quadraticCurveTo(hx + 110, hy - 70, hx + 95, hy - 150);
    ctx.quadraticCurveTo(hx + 72, hy - 85, hx + 12, hy - 52); ctx.closePath(); ctx.fill(); ctx.stroke();
    // alis & mata
    poly(ctx, [hx - 40, hy - 18, hx - 5, hy - 5, hx - 8, hy + 2, hx - 42, hy - 8], '#3b0a0a');
    poly(ctx, [hx + 36, hy - 18, hx + 5, hy - 5, hx + 8, hy + 2, hx + 38, hy - 8], '#3b0a0a');
    eye(ctx, hx - 22, hy + 4, 10, '#ffd000', 0.25);
    eye(ctx, hx + 18, hy + 4, 9, '#ffd000', -0.25);
    // mulut bertaring
    const open = a > 0.3 && a < 0.8 ? 16 : 6;
    ctx.fillStyle = '#200303';
    ctx.beginPath(); ctx.ellipse(hx - 2, hy + 30, 22, open, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f5f0e0';
    poly(ctx, [hx - 16, hy + 26, hx - 9, hy + 26, hx - 12, hy + 26 + open + 6], '#f5f0e0');
    poly(ctx, [hx + 6, hy + 26, hx + 13, hy + 26, hx + 10, hy + 26 + open + 6], '#f5f0e0');
    // tangan belakang
    limb(ctx, 135, -380, 160, -300, 34, '#7f1d1d'); limb(ctx, 160, -300, 150, -230, 30, '#7f1d1d');
    // tangan depan memegang kapak api
    const sx0 = -45, sy0 = -385;
    const lift = sw < 0 ? -sw : 0;
    const ex = sx0 - 40 + lift * 30, ey = sy0 + 85 - lift * 130;
    limb(ctx, sx0, sy0, ex, ey, 36, '#a11d1d');
    const hx2 = ex - 45 + lift * 20, hy2 = ey + 45 - lift * 90;
    limb(ctx, ex, ey, hx2, hy2, 30, '#a11d1d');
    ctx.save();
    ctx.translate(hx2, hy2);
    ctx.rotate(sw < 0 ? 0.55 + 3.1 * sw : 0.55 + 0.35 * sw);
    ctx.fillStyle = '#3a2618'; ctx.strokeStyle = '#0a0503'; ctx.lineWidth = 4;
    ctx.fillRect(-7, -40, 14, 290); ctx.strokeRect(-7, -40, 14, 290);
    ctx.translate(0, 230);
    ctx.beginPath();
    ctx.moveTo(0, -30); ctx.quadraticCurveTo(110, -80, 120, 10); ctx.quadraticCurveTo(110, 80, 0, 40);
    ctx.quadraticCurveTo(-40, 20, -30, 5); ctx.quadraticCurveTo(-40, -15, 0, -30);
    const ag = ctx.createLinearGradient(0, -60, 120, 60);
    ag.addColorStop(0, '#4b4f5c'); ag.addColorStop(1, '#16171d');
    ctx.fillStyle = ag; ctx.fill(); ctx.stroke();
    // api di mata kapak
    for (let i = 0; i < 7; i++) {
      const fx = 110 + Math.sin(t * 6 + i) * 10, fy = -60 + i * 18;
      glow(ctx, fx, fy, 30 + 10 * Math.sin(t * 8 + i * 2), 'rgba(255,120,20,0.9)', 0.6);
    }
    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  // ------------------------------------------------------------------ 4. RAJA IBLIS (fase 1)
  function demonKing(ctx, st) {
    const t = st.t, a = st.atk || 0;
    const sw = swing(a);
    const hover = Math.sin(t * 1.6) * 8;
    shadow(ctx, 170);
    // aura ungu
    for (let i = 0; i < 6; i++) {
      const ang = t * 0.6 + i * 1.05;
      glow(ctx, Math.cos(ang) * 120, -300 + Math.sin(ang * 1.3) * 160, 140, 'rgba(140,60,255,0.5)', 0.35);
    }
    ctx.save();
    ctx.translate(0, hover);
    // jubah lebar
    const sway = Math.sin(t * 1.3) * 14;
    ctx.beginPath();
    ctx.moveTo(-60, -470);
    ctx.quadraticCurveTo(-170 - sway, -250, -190 - sway, -10);
    for (let i = 0; i <= 10; i++) ctx.lineTo(-190 - sway + i * 40 + sway * (i / 10) * 2, -10 + (i % 2 ? -35 : 8));
    ctx.quadraticCurveTo(190 + sway, -250, 110, -470);
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, -470, 0, 0);
    cg.addColorStop(0, '#2e1065'); cg.addColorStop(0.6, '#1e0b3d'); cg.addColorStop(1, '#0c0418');
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = '#05010a'; ctx.lineWidth = 6; ctx.stroke();
    // bagian dalam jubah merah
    ctx.beginPath();
    ctx.moveTo(-20, -420); ctx.quadraticCurveTo(-90, -200, -100, -20); ctx.lineTo(120, -20);
    ctx.quadraticCurveTo(100, -200, 70, -420); ctx.closePath();
    ctx.fillStyle = '#4c0519'; ctx.fill();
    // zirah badan
    poly(ctx, [-45, -440, 95, -440, 85, -250, 25, -220, -35, -250], '#1a1a24', '#05050a', 6);
    poly(ctx, [-25, -420, 75, -420, 65, -290, 25, -265, -15, -290], '#2a2838', null);
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-25, -420); ctx.lineTo(25, -265); ctx.lineTo(75, -420); ctx.stroke();
    // permata dada
    const pul = 0.6 + 0.4 * Math.sin(t * 3);
    glow(ctx, 25, -360, 60, 'rgba(190,80,255,1)', 0.5 + 0.4 * pul);
    poly(ctx, [25, -385, 42, -360, 25, -335, 8, -360], '#d8b4fe', '#3b0764', 3);
    // bahu besar
    for (const [x, s] of [[-50, -1], [100, 1]]) {
      ctx.save(); ctx.translate(x, -440); ctx.scale(s, 1);
      ctx.beginPath(); ctx.ellipse(10, 5, 55, 35, -0.3, 0, TAU);
      ctx.fillStyle = '#1f1d2b'; ctx.fill(); ctx.strokeStyle = '#05050a'; ctx.lineWidth = 5; ctx.stroke();
      poly(ctx, [10, -20, 30, -80, 45, -15], '#3b3650', '#05050a', 4);
      ctx.restore();
    }
    // rambut putih panjang
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(-15, -540); ctx.quadraticCurveTo(-70, -470, -60, -360 + Math.sin(t * 2) * 6);
    ctx.lineTo(-30, -420); ctx.lineTo(70, -420); ctx.lineTo(110, -360 + Math.sin(t * 2 + 1) * 6);
    ctx.quadraticCurveTo(115, -470, 65, -540); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 3; ctx.stroke();
    // wajah pucat
    const hx = 25, hy = -505;
    ctx.fillStyle = '#c9c3d6'; ctx.strokeStyle = '#1f1a2b'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hx - 34, hy - 30); ctx.lineTo(hx + 34, hy - 30); ctx.lineTo(hx + 30, hy + 15);
    ctx.quadraticCurveTo(hx, hy + 52, hx - 30, hy + 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    // bayangan wajah
    ctx.fillStyle = 'rgba(30,10,50,0.55)';
    ctx.beginPath(); ctx.moveTo(hx - 34, hy - 30); ctx.lineTo(hx + 34, hy - 30); ctx.lineTo(hx + 32, hy - 2); ctx.lineTo(hx - 32, hy - 2); ctx.fill();
    eye(ctx, hx - 15, hy - 8, 8, '#ff1a1a', 0.3);
    eye(ctx, hx + 15, hy - 8, 8, '#ff1a1a', -0.3);
    ctx.strokeStyle = '#3b0a2a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx - 10, hy + 22); ctx.quadraticCurveTo(hx, hy + (a > 0.3 && a < 0.8 ? 32 : 25), hx + 12, hy + 20); ctx.stroke();
    // mahkota tanduk
    ctx.fillStyle = '#18181f'; ctx.strokeStyle = '#05050a'; ctx.lineWidth = 4;
    poly(ctx, [hx - 40, hy - 28, hx + 40, hy - 28, hx + 38, hy - 45, hx - 38, hy - 45], '#18181f', '#05050a', 4);
    const horns = [[-36, -110, -0.5], [-18, -80, -0.2], [0, -95, 0], [18, -80, 0.2], [36, -110, 0.5]];
    for (const [x, h] of horns) poly(ctx, [hx + x - 9, hy - 44, hx + x * 1.4, hy + h, hx + x + 9, hy - 44], '#24212f', '#05050a', 4);
    glow(ctx, hx, hy - 60, 40, 'rgba(255,40,80,1)', 0.4 + 0.3 * pul);
    // tangan kanan (belakang) mengepal energi
    limb(ctx, 100, -420, 140, -330, 26, '#1f1d2b', '#05050a');
    glow(ctx, 145, -320, 50, 'rgba(160,80,255,1)', 0.5 + 0.3 * Math.sin(t * 5));
    // tangan depan memegang tongkat
    const ang = sw;
    const ex = -70 - ang * 25, ey = -370 - ang * 40;
    limb(ctx, -45, -430, ex, ey, 26, '#1f1d2b', '#05050a');
    limb(ctx, ex, ey, ex - 30, ey + 50 - ang * 60, 22, '#1f1d2b', '#05050a');
    ctx.save();
    ctx.translate(ex - 30, ey + 50 - ang * 60);
    ctx.rotate(-0.15 + ang * 0.5);
    ctx.fillStyle = '#111018'; ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 3;
    ctx.fillRect(-6, -230, 12, 380); ctx.strokeRect(-6, -230, 12, 380);
    poly(ctx, [0, -330, 30, -250, 0, -225, -30, -250], '#111018', '#a78bfa', 3);
    const orbA = a > 0.3 && a < 0.8 ? 1 : 0.55 + 0.25 * Math.sin(t * 4);
    glow(ctx, 0, -265, 90, 'rgba(170,80,255,1)', orbA);
    ctx.fillStyle = '#e9d5ff'; ctx.beginPath(); ctx.arc(0, -265, 16, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ------------------------------------------------------------------ 5. RAJA IBLIS (fase 2)
  function demonKing2(ctx, st) {
    const t = st.t, a = st.atk || 0;
    const sw = swing(a);
    const breath = Math.sin(t * 1.8) * 6;
    const flap = Math.sin(t * 2) * 0.12;
    shadow(ctx, 230);
    // aura api
    for (let i = 0; i < 9; i++) {
      const p = (t * 0.5 + i / 9) % 1;
      glow(ctx, Math.sin(i * 3.1) * 180, -60 - p * 560, 120 * (1 - p) + 40, 'rgba(255,60,10,0.7)', 0.4 * (1 - p) + 0.1);
    }
    ctx.save();
    // sayap compang-camping besar
    function wing(side) {
      ctx.save();
      ctx.translate(side * 40 + 40, -470 + breath);
      ctx.scale(side, 1);
      ctx.rotate(-0.25 + flap * side);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(150, -230); ctx.lineTo(360, -200);
      ctx.lineTo(330, -120); ctx.lineTo(370, -40); ctx.lineTo(290, -40);
      ctx.lineTo(300, 50); ctx.lineTo(220, 20); ctx.lineTo(200, 120);
      ctx.lineTo(140, 60); ctx.lineTo(90, 140); ctx.lineTo(60, 60); ctx.closePath();
      const g = ctx.createLinearGradient(0, -230, 300, 120);
      g.addColorStop(0, '#3f0a0a'); g.addColorStop(1, '#0d0202');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#1a0404'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(150, -230);
      for (const [x, y] of [[360, -200], [370, -40], [300, 50], [200, 120], [90, 140]]) { ctx.moveTo(150, -230); ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.restore();
    }
    wing(1); wing(-1);
    // kaki besar bercakar
    limb(ctx, 0, -250, -50, -130, 62, '#2a0b0b'); limb(ctx, -50, -130, -60, -20, 54, '#2a0b0b');
    limb(ctx, 110, -250, 140, -130, 62, '#230909'); limb(ctx, 140, -130, 130, -20, 54, '#230909');
    for (const x of [-60, 130]) for (let k = -1; k <= 1; k++) poly(ctx, [x + k * 18 - 8, -10, x + k * 18 + 8, -10, x + k * 22 - 14, 6], '#e7dfc8', '#0a0303', 3);
    // badan
    ctx.save();
    ctx.translate(0, breath);
    ctx.beginPath();
    ctx.moveTo(-90, -500); ctx.quadraticCurveTo(55, -545, 200, -500);
    ctx.quadraticCurveTo(185, -360, 150, -260); ctx.lineTo(-40, -260);
    ctx.quadraticCurveTo(-90, -360, -90, -500); ctx.closePath();
    const bg = ctx.createLinearGradient(-90, -500, 200, -260);
    bg.addColorStop(0, '#3b0d0d'); bg.addColorStop(1, '#120303');
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 7; ctx.stroke();
    // retakan lava menyala
    const lav = 0.6 + 0.4 * Math.sin(t * 3);
    ctx.save();
    ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 18;
    ctx.strokeStyle = `rgba(255,${120 + 60 * lav | 0},20,1)`; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(55, -520); ctx.lineTo(40, -450); ctx.lineTo(70, -400); ctx.lineTo(50, -330); ctx.lineTo(60, -270);
    ctx.moveTo(40, -450); ctx.lineTo(-30, -420); ctx.lineTo(-60, -360);
    ctx.moveTo(70, -400); ctx.lineTo(140, -380); ctx.lineTo(165, -320);
    ctx.moveTo(50, -330); ctx.lineTo(0, -300);
    ctx.stroke();
    ctx.restore();
    // inti jantung
    glow(ctx, 55, -400, 110, 'rgba(255,90,0,1)', 0.45 + 0.35 * lav);
    // bahu tulang
    for (const [x, s] of [[-90, -1], [200, 1]]) {
      ctx.save(); ctx.translate(x, -500); ctx.scale(s, 1);
      poly(ctx, [-40, 30, 50, -30, 80, 40, 10, 70], '#1a0606', '#000', 5);
      poly(ctx, [0, 5, -15, -90, 30, -10], '#e7dfc8', '#1c1010', 3);
      poly(ctx, [35, -12, 45, -100, 62, -10], '#e7dfc8', '#1c1010', 3);
      ctx.restore();
    }
    // kepala dengan 4 tanduk & 3 mata
    const hx = 55, hy = -585;
    ctx.fillStyle = '#2a0a0a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hx - 60, hy - 30); ctx.quadraticCurveTo(hx, hy - 85, hx + 60, hy - 30);
    ctx.lineTo(hx + 45, hy + 40); ctx.quadraticCurveTo(hx, hy + 80, hx - 45, hy + 40); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d6ccb0';
    const hornPairs = [[-1, 150, 190], [1, 150, 190], [-1, 90, 120], [1, 90, 120]];
    for (const [s, w, h] of hornPairs) {
      ctx.beginPath();
      ctx.moveTo(hx + s * 30, hy - 40);
      ctx.quadraticCurveTo(hx + s * w, hy - h * 0.4, hx + s * (w - 30), hy - h);
      ctx.quadraticCurveTo(hx + s * (w * 0.55), hy - h * 0.45, hx + s * 8, hy - 55);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    eye(ctx, hx - 24, hy - 8, 11, '#ff2a00', 0.3);
    eye(ctx, hx + 24, hy - 8, 11, '#ff2a00', -0.3);
    eye(ctx, hx, hy - 40, 9, '#ffcc00', Math.PI / 2);
    // mulut menyala
    const open = a > 0.3 && a < 0.85 ? 26 : 10 + 3 * Math.sin(t * 4);
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath(); ctx.ellipse(hx, hy + 38, 30, open, 0, 0, TAU); ctx.fill();
    glow(ctx, hx, hy + 38, 70, 'rgba(255,120,0,1)', 0.6);
    ctx.fillStyle = '#f5f0e0';
    for (let i = 0; i < 6; i++) {
      const x = hx - 25 + i * 10;
      poly(ctx, [x, hy + 38 - open, x + 7, hy + 38 - open, x + 3.5, hy + 38 - open + 14], '#f5f0e0');
      poly(ctx, [x, hy + 38 + open, x + 7, hy + 38 + open, x + 3.5, hy + 38 + open - 12], '#f5f0e0');
    }
    // lengan bercakar
    const raise = Math.max(0, -sw) * 1.0 + (sw > 0 ? -sw * 0.4 : 0);
    for (const [sx0, s, col] of [[-80, -1, '#3a0d0d'], [190, 1, '#2a0909']]) {
      const ex = sx0 + s * 70, ey = -420 - raise * 120;
      limb(ctx, sx0, -480, ex, ey, 48, col, '#000');
      const hx2 = ex + s * 10 - (s < 0 ? 40 * Math.max(0, sw) : 0), hy2 = ey + 110 - raise * 160;
      limb(ctx, ex, ey, hx2, hy2, 42, col, '#000');
      for (let k = -1; k <= 1; k++) {
        ctx.save(); ctx.translate(hx2 + k * 14, hy2 + 18); ctx.rotate(k * 0.3 + (raise > 0.3 ? Math.PI : 0));
        poly(ctx, [-6, 0, 6, 0, 0, 40], '#e7dfc8', '#100', 3);
        ctx.restore();
      }
      if (raise > 0.3) glow(ctx, hx2, hy2, 110, 'rgba(255,80,0,1)', 0.7);
    }
    ctx.restore();
    ctx.restore();
  }

  const DEFS = {
    slime: { draw: slime, height: 230, scaleFix: 1.45, width: 330, hitY: 0.45, color: '#a78bfa' },
    skeleton: { draw: skeleton, height: 500, scaleFix: 1.1, width: 300, hitY: 0.55, color: '#7dd3fc' },
    general: { draw: general, height: 600, scaleFix: 0.92, width: 420, hitY: 0.55, color: '#f87171' },
    demonking1: { draw: demonKing, height: 640, width: 380, hitY: 0.6, color: '#c084fc' },
    demonking2: { draw: demonKing2, height: 760, scaleFix: 0.84, width: 560, hitY: 0.55, color: '#fb923c' },
  };

  function def(key, phase) {
    if (key === 'demonking') return DEFS['demonking' + (phase || 1)];
    return DEFS[key];
  }

  window.Enemies = { def, glow, TAU };
})();
