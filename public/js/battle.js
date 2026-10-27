// Mesin pertarungan di layar guru (canvas 1920x1080).
(function () {
  const W = 1920, H = 1080;
  const TAU = Math.PI * 2;
  const CHARS = Object.fromEntries(GameData.CHARACTERS.map((c) => [c.id, c]));
  const ENEMY_X = 1490, ENEMY_Y = 925;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeIn = (x) => { x = clamp(x); return x * x * x; };
  const MELEE = new Set(['ksatria', 'paladin', 'assassin']);
  const TRAIL_COL = { fireWave: '255,130,30', fireClaw: '255,110,40', slash: '255,210,90', fireball: '255,140,40', orb: '255,90,30', holy: '255,240,170', arrow: '140,255,170', dagger: '200,130,255', shockwave: '130,190,255', claw: '200,140,255', shard: '200,140,255', rock: '170,170,200', blob: '170,90,255', boneSlash: '110,200,255' };
  const rand = (a, b) => a + Math.random() * (b - a);
  const glow = (ctx, x, y, r, color, a = 1) => Enemies.glow(ctx, x, y, r, color, a);

  class Battle {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      canvas.width = W; canvas.height = H;
      this.actors = new Map();
      this.enemy = null;
      this.fx = [];
      this.particles = [];
      this.texts = [];
      this.stage = 1; this.phase = 1;
      this.scroll = 0; this.t = 0;
      this.shake = 0; this.dim = 0; this.dimTarget = 0;
      this.flash = 0; this.flashColor = '255,255,255';
      this.fade = 0; this.fadeTarget = 0;
      this.banner = null;
      this.spot = null;
      this.answered = new Set();
      this.questionActive = false;
      this.barrier = 0;
      this.enemyBarVisible = true;
      this.lightning = 0;
      // --- sinematik
      this.gt = 0;                       // jam game (ikut hit-stop & slow-motion)
      this.timers = []; this.tweens = [];
      this.hitstop = 0; this.slowT = 0; this.slowScale = 1;
      this.cam = { x: W / 2, y: H / 2, z: 1 };
      this.camT = { x: W / 2, y: H / 2, z: 1, rate: 4 };
      this.kick = { x: 0, y: 0 };
      this.bars = 0; this.barsT = 0;     // cinema bar atas-bawah
      this.speed = null;                 // speed lines { x, y, color, a, aT }
      this.hurt = 0;                     // vignette merah saat party terluka
      this.danger = 0; this.dangerT = 0; // vignette berdenyut saat musuh bersiap
      this.impact = 0;                   // impact frame (warna terbalik)
      this.combo = null;
      this.callouts = [];                // teks besar layar (FINISH!, K.O.!)
      this.warning = null;               // layar peringatan boss
      this.bossCard = null;              // kartu nama boss
      this.enraged = false; this.hbT = 0; // boss mengamuk + detak jantung
      this.last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.update(dt);
        this.render();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    // Semua jeda & tween memakai jam game, sehingga hit-stop/slow-motion
    // memperlambat seluruh adegan secara serempak.
    wait(ms) { return new Promise((r) => this.timers.push({ at: this.gt + ms / 1000, fn: r })); }
    after(ms, fn) { this.timers.push({ at: this.gt + ms / 1000, fn }); }
    hitStop(ms) { this.hitstop = Math.max(this.hitstop, ms / 1000); }
    slowMo(scale, ms) { this.slowScale = scale; this.slowT = Math.max(this.slowT, ms / 1000); }
    focus(x, y, z = 1, rate = 4) { this.camT = { x, y, z, rate }; }
    resetCam(rate = 3) { this.focus(W / 2, H / 2, 1, rate); }
    impactFrame(ms = 90) { this.impact = Math.max(this.impact, ms / 1000); }
    callout(text, color = '#fde68a', opts = {}) {
      this.callouts.push({ text, color, t: 0, dur: opts.dur || 1.3, size: opts.size || 150, y: opts.y || H * 0.42, sub: opts.sub || '' });
    }
    partyCenter() {
      const xs = [...this.actors.values()].map((a) => a.tx);
      return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 700;
    }

    // ------------------------------------------------------------ party
    setParty(players) {
      const ids = new Set(players.map((p) => p.id));
      for (const id of [...this.actors.keys()]) if (!ids.has(id)) this.actors.delete(id);
      for (const p of players) {
        let a = this.actors.get(p.id);
        const ch = CHARS[p.charId] || CHARS.ksatria;
        if (!a) {
          a = {
            id: p.id, charId: ch.id, char: ch, anim: new Sprites.Animator(ch.id, ch.fps),
            x: 400, y: 800, h: 190, ox: 0, oy: 0, hp: p.hp, ko: p.ko, spawn: 0, flash: 0, alpha: 1, hidden: false,
          };
          a.anim.t = Math.random() * 3;
          this.actors.set(p.id, a);
          this.spawnPillar(a);
          Sprites.load(ch.id);
        }
        if (a.charId !== p.charId && CHARS[p.charId]) {
          a.charId = p.charId; a.char = CHARS[p.charId]; a.anim = new Sprites.Animator(p.charId, a.char.fps);
          Sprites.load(p.charId);
        }
        a.name = p.name; a.hp = p.hp; a.ko = p.ko; a.connected = p.connected; a.streak = p.streak || 0;
      }
      this.layout();
    }

    layout() {
      const list = [...this.actors.values()];
      const n = list.length;
      const rows = n <= 5 ? 1 : n <= 10 ? 2 : n <= 15 ? 3 : 4;
      const baseH = [0, 250, 215, 188, 168][rows];
      const ys = { 1: [860], 2: [775, 925], 3: [700, 815, 930], 4: [650, 752, 855, 958] }[rows];
      list.forEach((a, i) => {
        const row = rows - 1 - (i % rows); // isi baris depan (bawah) dulu
        const col = Math.floor(i / rows);
        const depth = rows === 1 ? 1 : row / (rows - 1);
        const h = baseH * (0.9 + 0.12 * depth);
        const spacing = baseH * 0.78;
        a.tx = 1040 - col * spacing - (rows - 1 - row) * 40 + (row % 2) * spacing * 0.4;
        a.ty = ys[row];
        a.h = h;
        if (!a.placed) { a.x = a.tx; a.y = a.ty; a.placed = true; }
      });
    }

    setAnswered(ids) { this.answered = new Set(ids); }

    spawnPillar(a) {
      this.fx.push({
        t: 0, dur: 1.0, layer: 'front',
        draw(ctx) {
          const k = this.t / this.dur;
          const w = 70 * (1 - k) + 10;
          const g = ctx.createLinearGradient(a.x, 0, a.x, a.y);
          g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(1, `rgba(255,230,150,${0.8 * (1 - k)})`);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g; ctx.fillRect(a.x - w / 2, 0, w, a.y);
          ctx.restore();
        },
      });
      a.spawn = 1;
      Sfx.join();
    }

    // ------------------------------------------------------------ musuh
    setEnemy(info, { entrance = false } = {}) {
      if (!info) { this.enemy = null; return; }
      const def = Enemies.def(info.key, info.phase);
      this.enemy = {
        key: info.key, phase: info.phase || 1, name: info.name, title: info.title, def,
        boss: !!(info.boss || def.boss),
        hp: info.hp, hpMax: info.hpMax, shownHp: info.hp,
        x: ENEMY_X, y: ENEMY_Y, ox: 0, oy: 0, st: { t: 0, atk: 0, skill: 0, dying: -1 },
        atkT: -1, skillT: -1, hitT: 0, alpha: entrance ? 0 : 1, enter: entrance ? 0 : 1, dying: -1, scale: 1,
      };
      if (info.stage) { this.stage = info.stage; this.phase = info.phase || 1; }
      this.enraged = false;
    }

    enemyHead() {
      const e = this.enemy;
      return { x: e.x - 30, y: e.y - e.def.height * e.def.hitY * e.scale * (e.def.scaleFix || 1) };
    }

    async enemyEntrance() {
      const e = this.enemy; if (!e) return;
      e.enter = 0; e.alpha = 0;
      Sfx.roar();
      this.shake = 10;
      await this.tween(1200, (k) => { e.enter = easeOut(k); e.alpha = k; });
      if (e.def.sprite) { e.skillT = 0; e.skillDur = 1.6; Sfx.roar(); this.shake = 12; }
      this.showBanner(e.title ? `STAGE ${this.stage}` : '', e.name, e.def.color, 2200, e.title);
      await this.wait(900);
    }

    tween(ms, fn) {
      return new Promise((res) => {
        fn(0);
        this.tweens.push({ start: this.gt, dur: Math.max(0.001, ms / 1000), fn, res });
      });
    }

    showBanner(title, text, color = '#facc15', dur = 2000, sub = '') {
      this.banner = { title, text, sub, color, t: 0, dur: dur / 1000 };
    }

    // ------------------------------------------------------------ efek dasar
    addText(x, y, text, color = '#fff', size = 46, opts = {}) {
      this.texts.push({ x, y, text, color, size, t: 0, dur: opts.dur || 1.3, vy: opts.vy || -70, stroke: opts.stroke || '#1a0b12', pop: 1 });
    }

    burst(x, y, color, n = 18, speed = 380, size = 6, opts = {}) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), s = rand(speed * 0.3, speed);
        this.particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.up || 0), life: 0, max: rand(0.4, 0.9) * (opts.life || 1),
          size: rand(size * 0.5, size * 1.3), color, grav: opts.grav == null ? 300 : opts.grav, add: true,
        });
      }
    }

    sparks(x, y, color, n = 14, speed = 900, dir = null, top = false) {
      for (let i = 0; i < n; i++) {
        const a = dir == null ? rand(0, TAU) : dir + rand(-0.9, 0.9), sp = rand(speed * 0.35, speed);
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(0.18, 0.4), size: rand(4, 9), color, grav: 600, streak: true, top });
      }
    }

    // goresan tebasan yang membekas sebentar di titik hantam
    slashMark(x, y, color = '255,255,255', size = 130, ang = rand(-0.9, -0.3)) {
      this.fx.push({
        t: 0, dur: 0.35, layer: 'top',
        draw(ctx) {
          const k = this.t / this.dur;
          const grow = easeOut(Math.min(1, k * 4));
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.translate(x, y); ctx.rotate(ang);
          ctx.fillStyle = `rgba(${color},${1 - k})`;
          ctx.beginPath();
          ctx.moveTo(-size * grow, 0); ctx.quadraticCurveTo(0, -10 * (1 - k) - 4, size * grow, 0); ctx.quadraticCurveTo(0, 10 * (1 - k) + 4, -size * grow, 0);
          ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
          ctx.fillRect(-size * grow * 0.7, -1.5, size * grow * 1.4, 3);
          ctx.restore();
        },
      });
    }

    emit(x, y, color, size = 8, vx = 0, vy = 0, life = 0.5, grav = 0) {
      this.particles.push({ x, y, vx: vx + rand(-40, 40), vy: vy + rand(-40, 40), life: 0, max: life, size, color, grav, add: true });
    }

    hitEnemy(dmg, opts = {}) {
      const e = this.enemy; if (!e) return;
      const big = !!opts.big;
      const crit = !big && (opts.ult || dmg >= 112);   // jawaban sangat cepat / ultimate tanpa sorotan
      e.hitT = 1;
      e.ox = big ? 70 : crit ? 40 : 24;            // knockback ke belakang
      e.squash = big ? 1 : 0.6;
      const p = this.enemyHead();
      const hx = p.x + rand(-60, 40), hy = p.y + rand(-80, 70);
      const col = opts.color || '255,220,120';
      this.burst(hx, hy, col, big ? 40 : 10, big ? 700 : 340, big ? 10 : 6);
      this.sparks(hx, hy, col, big ? 30 : crit ? 18 : 9, big ? 1500 : 1000, null, big);
      if (!opts.noMark) this.slashMark(hx, hy, col, big ? 260 : crit ? 170 : 110);
      if (dmg != null) {
        // angka damage disebar ke slot melingkar agar tidak saling menumpuk
        const SLOTS = [[-190, -210], [70, -260], [-60, -110], [140, -150], [-230, -40], [10, -330], [170, -30], [-120, -300], [40, -40], [-280, -160]];
        this.dmgSlot = ((this.dmgSlot || 0) + 1) % SLOTS.length;
        const [ox, oy] = SLOTS[this.dmgSlot];
        const tx = p.x + ox + rand(-15, 15), ty = p.y + oy + rand(-10, 10);
        if (crit) this.addText(tx, ty - 58, opts.ult ? 'ULTIMATE!' : 'KRITIS!', opts.ult ? '#c4b5fd' : '#fb923c', 34, { vy: -60, dur: 1.1 });
        this.addText(tx, ty, String(dmg), big ? '#ffd23f' : crit ? '#fde047' : '#ffffff', big ? 110 : crit ? 72 : 50, { vy: -90, stroke: crit || big ? '#7c2d12' : '#1a0b12' });
        if (this.combo) { this.combo.hits++; this.combo.dmg += dmg; this.combo.pop = 1; this.combo.t = 0; }
      }
      if (opts.hpDrop) e.shownHp = Math.max(0, e.shownHp - opts.hpDrop);
      this.shake = Math.max(this.shake, big ? 30 : crit ? 14 : 7);
      this.kick.x += big ? 26 : crit ? 12 : 5;
      // hit-stop: pukulan pertama, kritis, dan setiap pukulan ke-4 (agar tetap cepat untuk 20 siswa)
      const n = this.combo ? this.combo.hits : 0;
      if (big) this.hitStop(150);
      else if (crit) this.hitStop(75);
      else if (n <= 1 || n % 4 === 0) this.hitStop(45);
      Sfx.impact();
      if (crit || big) Sfx.crit();
    }

    // ------------------------------------------------------------ proyektil
    projectile(type, from, to, dur, onHit, color) {
      const self = this;
      const fx = {
        t: 0, dur, layer: 'front', type, from, to, color,
        pos() {
          const k = ease(this.t / this.dur);
          const arc = type === 'arrow' ? -60 : type === 'blob' || type === 'meteorSmall' ? -180 : type === 'fireball' ? -40 : 0;
          return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * arc, k };
        },
        update(dt) {
          const p = this.pos();
          (this.trail = this.trail || []).push({ x: p.x, y: p.y });
          if (this.trail.length > 12) this.trail.shift();
          if (type === 'fireball' || type === 'orb') self.emit(p.x, p.y, type === 'orb' ? '255,120,40' : '255,140,40', 10, -120, rand(-30, 30), 0.35);
          if (type === 'holy') self.emit(p.x, p.y, '255,240,170', 6, rand(-80, 80), rand(-80, 80), 0.4);
          if (type === 'dagger') self.emit(p.x, p.y, '190,120,255', 5, -60, 0, 0.25);
          if (type === 'arrow') self.emit(p.x, p.y, '120,255,160', 4, -50, 0, 0.25);
          if (type === 'blob') self.emit(p.x, p.y, '170,90,255', 7, 0, 0, 0.3, 200);
          if (type === 'rock') self.emit(p.x, p.y + 20, '150,140,130', 6, 0, -30, 0.35, 300);
          if (type === 'shard' || type === 'claw') self.emit(p.x, p.y, '190,120,255', 6, 0, -40, 0.3);
          if (this.t >= this.dur && !this.done) { this.done = true; onHit && onHit(p); }
          return !this.done;
        },
        draw(ctx) {
          // ekor cahaya meruncing di belakang proyektil
          const tr = this.trail;
          if (tr && tr.length > 2) {
            const col = TRAIL_COL[type] || '255,255,255';
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            for (let i = 1; i < tr.length; i++) {
              const k = i / tr.length;
              ctx.strokeStyle = `rgba(${col},${0.55 * k})`;
              ctx.lineWidth = 2 + 16 * k;
              ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
            }
            ctx.restore();
          }
          const p = this.pos();
          const ang = Math.atan2(to.y - from.y, to.x - from.x);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.globalCompositeOperation = 'lighter';
          if (type === 'slash') {
            ctx.rotate(ang);
            for (let i = 0; i < 3; i++) {
              ctx.strokeStyle = `rgba(255,${220 - i * 40},${120 - i * 40},${0.9 - i * 0.25})`;
              ctx.lineWidth = 14 - i * 4;
              ctx.beginPath(); ctx.arc(-30 - i * 12, 0, 70, -1.2, 1.2); ctx.stroke();
            }
            glow(ctx, 0, 0, 90, 'rgba(255,210,100,0.8)', 0.5);
          } else if (type === 'fireball' || type === 'orb') {
            glow(ctx, 0, 0, 70, type === 'orb' ? 'rgba(255,60,20,1)' : 'rgba(255,120,30,1)', 0.9);
            ctx.fillStyle = '#fff1b8'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
          } else if (type === 'holy') {
            glow(ctx, 0, 0, 80, 'rgba(255,240,180,1)', 0.9);
            ctx.rotate(self.t * 6);
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(5, 0); ctx.lineTo(-5, 0); ctx.fill(); }
          } else if (type === 'arrow') {
            const k = p.k, a2 = ang + Math.cos(k * Math.PI) * -0.35;
            ctx.rotate(a2);
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#7c5a2a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(20, 0); ctx.stroke();
            ctx.fillStyle = '#d1d5db'; ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(16, -8); ctx.lineTo(16, 8); ctx.fill();
            ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(-62, -9); ctx.lineTo(-40, 0); ctx.lineTo(-62, 9); ctx.fill();
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, 0, 0, 40, 'rgba(100,255,150,1)', 0.5);
          } else if (type === 'dagger') {
            ctx.rotate(self.t * 25);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(0, -7); ctx.lineTo(-10, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#3b2a4a'; ctx.fillRect(-24, -4, 16, 8);
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, 0, 0, 40, 'rgba(180,100,255,1)', 0.6);
          } else if (type === 'shockwave') {
            ctx.rotate(ang);
            const s = 1 + p.k * 0.8;
            for (let i = 0; i < 3; i++) {
              ctx.strokeStyle = `rgba(120,190,255,${0.9 - i * 0.25})`; ctx.lineWidth = 10 - i * 3;
              ctx.beginPath(); ctx.ellipse(-i * 18, 0, 26 * s, 70 * s, 0, -1.3, 1.3); ctx.stroke();
            }
            glow(ctx, 0, 0, 90, 'rgba(100,170,255,1)', 0.5);
          } else if (type === 'blob') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#7c3aed'; ctx.strokeStyle = '#1e0533'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.ellipse(0, 0, 22, 18, self.t * 3, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-6, -6, 5, 0, TAU); ctx.fill();
          } else if (type === 'fireWave') {
            // gelombang api bulan sabit yang menyapu tanah
            ctx.rotate(ang);
            for (let i = 0; i < 4; i++) {
              ctx.strokeStyle = `rgba(255,${200 - i * 40},${80 - i * 20},${0.95 - i * 0.2})`; ctx.lineWidth = 22 - i * 5;
              ctx.beginPath(); ctx.arc(-40 - i * 16, 0, 80, -1.2, 1.2); ctx.stroke();
            }
            glow(ctx, 0, 0, 120, 'rgba(255,110,20,1)', 0.7);
          } else if (type === 'fireClaw') {
            ctx.rotate(ang);
            for (let i = 0; i < 3; i++) {
              ctx.strokeStyle = `rgba(255,${190 - i * 30},70,${0.95 - i * 0.2})`; ctx.lineWidth = 10;
              ctx.beginPath(); ctx.arc(-34, (i - 1) * 26, 66, -1.0, 1.0); ctx.stroke();
            }
            glow(ctx, 0, 0, 90, 'rgba(255,90,20,1)', 0.7);
          } else if (type === 'rock') {
            ctx.rotate(self.t * -8);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#6b7280'; ctx.strokeStyle = '#1f2430'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-26, -8); ctx.lineTo(-10, -26); ctx.lineTo(18, -22); ctx.lineTo(28, 4); ctx.lineTo(10, 24); ctx.lineTo(-20, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#a5b4fc'; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(8, -40); ctx.lineTo(12, -20); ctx.fill();
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, 6, -26, 30, 'rgba(130,150,255,1)', 0.6);
          } else if (type === 'claw') {
            ctx.rotate(ang);
            for (let i = 0; i < 3; i++) {
              ctx.strokeStyle = `rgba(200,140,255,${0.95 - i * 0.2})`; ctx.lineWidth = 8;
              ctx.beginPath(); ctx.arc(-30, (i - 1) * 22, 55, -1.0, 1.0); ctx.stroke();
            }
            glow(ctx, 0, 0, 70, 'rgba(170,90,255,1)', 0.6);
          } else if (type === 'shard') {
            ctx.rotate(ang - Math.PI / 2);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#c084fc'; ctx.strokeStyle = '#3b0764'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(11, 0); ctx.lineTo(0, -26); ctx.lineTo(-11, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(4, 0); ctx.lineTo(0, -18); ctx.fill();
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, 0, 0, 50, 'rgba(180,90,255,1)', 0.7);
          } else if (type === 'boneSlash') {
            ctx.rotate(ang);
            for (let i = 0; i < 3; i++) {
              ctx.strokeStyle = `rgba(110,200,255,${0.9 - i * 0.25})`; ctx.lineWidth = 12 - i * 3;
              ctx.beginPath(); ctx.arc(-30 - i * 10, 0, 60, -1.1, 1.1); ctx.stroke();
            }
          }
          ctx.restore();
        },
      };
      this.fx.push(fx);
      return fx;
    }

    // ------------------------------------------------------------ update & render
    update(realDt) {
      // skala waktu: hit-stop membekukan, slow-motion memperlambat
      let scale = 1;
      if (this.hitstop > 0) { this.hitstop -= realDt; scale = 0; }
      else if (this.slowT > 0) { this.slowT -= realDt; scale = this.slowScale; }
      const dt = realDt * scale;
      this.gt += dt;
      if (this.timers.length) {
        const due = this.timers.filter((t) => t.at <= this.gt);
        if (due.length) { this.timers = this.timers.filter((t) => t.at > this.gt); due.forEach((t) => t.fn()); }
      }
      if (this.tweens.length) {
        const done = [];
        for (const tw of this.tweens) {
          const k = clamp((this.gt - tw.start) / tw.dur);
          tw.fn(k);
          if (k >= 1) done.push(tw);
        }
        if (done.length) { this.tweens = this.tweens.filter((tw) => !done.includes(tw)); done.forEach((tw) => tw.res()); }
      }
      // kamera (pegas halus), getar & overlay berjalan di waktu nyata
      const ck = 1 - Math.exp(-this.camT.rate * dt);
      this.cam.x += (this.camT.x - this.cam.x) * ck;
      this.cam.y += (this.camT.y - this.cam.y) * ck;
      this.cam.z += (this.camT.z - this.cam.z) * ck;
      this.kick.x *= Math.pow(0.0008, realDt); this.kick.y *= Math.pow(0.0008, realDt);
      this.bars += (this.barsT - this.bars) * Math.min(1, realDt * 7);
      const cin = this.barsT > 0;
      if (cin !== this._cinema) { this._cinema = cin; if (this.onCinema) this.onCinema(cin); }
      this.hurt = Math.max(0, this.hurt - realDt * 1.6);
      this.danger += (this.dangerT - this.danger) * Math.min(1, realDt * 4);
      this.impact = Math.max(0, this.impact - realDt);
      if (this.speed) { this.speed.a += (this.speed.aT - this.speed.a) * Math.min(1, realDt * 8); if (this.speed.aT === 0 && this.speed.a < 0.02) this.speed = null; }
      this.callouts = this.callouts.filter((c) => { c.t += realDt; return c.t < c.dur; });
      if (this.warning) this.warning.t += realDt;
      if (this.bossCard) { this.bossCard.t += realDt; if (this.bossCard.t > this.bossCard.dur) this.bossCard = null; }
      // boss mengamuk saat HP < 35%: aura merah, detak jantung, layar berdenyut
      const be = this.enemy;
      if (be && be.boss && be.dying < 0 && be.shownHp > 0 && be.shownHp / be.hpMax < 0.35) {
        if (!this.enraged) {
          this.enraged = true;
          this.callout('BOSS MENGAMUK!', '#f87171', { size: 104, y: H * 0.18, dur: 1.6, sub: 'Serangannya kini lebih ganas — jangan sampai salah!' });
          Sfx.roar();
        }
        be.rageT = Math.max(be.rageT || 0, 0.4);
        this.hbT -= realDt;
        if (this.hbT <= 0) { this.hbT = 0.95; Sfx.heartbeat(); this.hurt = Math.max(this.hurt, 0.18); }
      }
      if (this.combo) { this.combo.t += realDt; this.combo.pop = Math.max(0, this.combo.pop - realDt * 5); if (this.combo.fade && this.combo.t > this.combo.fade) this.combo = null; }
      this.t += dt;
      for (const a of this.actors.values()) {
        a.anim.update(dt);
        a.x += (a.tx - a.x) * Math.min(1, dt * 4);
        a.y += (a.ty - a.y) * Math.min(1, dt * 4);
        if (!a.dashing) { a.ox *= Math.pow(0.0005, dt); a.oy *= Math.pow(0.0005, dt); }
        a.rot = (a.rot || 0) * Math.pow(0.002, dt);
        if (a.trailOn) {
          a.trailAcc = (a.trailAcc || 0) + dt;
          if (a.trailAcc > 0.022) {
            a.trailAcc = 0;
            (a.trail = a.trail || []).push({ x: a.x + a.ox, y: a.y + a.oy, anim: a.anim.anim, frame: a.anim.frame(), life: 1 });
            if (a.trail.length > 7) a.trail.shift();
          }
        }
        if (a.trail) { a.trail.forEach((g) => { g.life -= dt * 3.2; }); a.trail = a.trail.filter((g) => g.life > 0); }
        a.flash = Math.max(0, a.flash - dt * 2.5);
        a.spawn = Math.max(0, a.spawn - dt * 1.5);
      }
      const e = this.enemy;
      if (e) {
        e.st.t += dt;
        if (e.atkT >= 0) { e.atkT += dt / (e.atkDur || 1.2); e.st.atk = Math.min(1, e.atkT); if (e.atkT >= 1) { e.atkT = -1; e.st.atk = 0; } }
        if (e.skillT >= 0) { e.skillT += dt / (e.skillDur || 1.4); e.st.skill = Math.min(1, e.skillT); if (e.skillT >= 1) { e.skillT = -1; e.st.skill = 0; } }
        e.st.dying = e.dying;
        e.hitT = Math.max(0, e.hitT - dt * 6);
        e.ox *= Math.pow(0.002, dt);
        e.squash = Math.max(0, (e.squash || 0) - dt * 4);
        e.rage = (e.rage || 0) + ((e.rageT || 0) - (e.rage || 0)) * Math.min(1, dt * 5);
        e.barHp = e.barHp == null ? e.shownHp : e.barHp + (e.shownHp - e.barHp) * Math.min(1, dt * 6);
      }
      this.fx = this.fx.filter((f) => {
        f.t += dt;
        const alive = f.update ? f.update(dt) !== false : true;
        return alive && f.t < f.dur + (f.extra || 0);
      });
      this.particles = this.particles.filter((p) => {
        p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.vx *= 0.98;
        return p.life < p.max;
      });
      this.texts = this.texts.filter((t) => { t.t += dt; t.y += t.vy * dt; t.vy *= 0.96; return t.t < t.dur; });
      this.shake *= Math.pow(0.02, realDt);
      this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 5);
      this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 4);
      this.flash = Math.max(0, this.flash - dt * 2);
      this.lightning = Math.max(0, this.lightning - dt * 3);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
      if (this.spot) this.spot.anim.update(dt);
    }

    render() {
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sx = (Math.random() - 0.5) * this.shake + this.kick.x, sy = (Math.random() - 0.5) * this.shake + this.kick.y;
      const z = Math.max(1, this.cam.z);
      const hw = W / (2 * z), hh = H / (2 * z);
      const cx = clamp(this.cam.x, hw, W - hw), cy = clamp(this.cam.y, hh, H - hh);
      this.view = { cx, cy, z };
      ctx.translate(W / 2 + sx, H / 2 + sy);
      ctx.scale(z, z);
      ctx.translate(-cx, -cy);
      Backgrounds.draw(ctx, this.stage, this.phase, this.t, this.scroll, this.lightning);

      this.fx.filter((f) => f.layer === 'back').forEach((f) => f.draw(ctx));
      // urutkan aktor menurut kedalaman (y)
      const drawList = [...this.actors.values()].sort((a, b) => a.y - b.y);
      for (const a of drawList) this.drawActorShadow(a);
      if (this.enemy) this.drawEnemy();
      for (const a of drawList) this.drawActor(a);
      Backgrounds.drawFront(ctx, this.stage, this.phase, this.scroll);
      if (this.barrier > 0.01) this.drawBarrier();
      this.fx.filter((f) => f.layer === 'front').forEach((f) => f.draw(ctx));
      this.drawParticles();
      for (const a of drawList) this.drawTag(a);

      if (this.dim > 0.01) { ctx.fillStyle = `rgba(5,2,12,${this.dim})`; ctx.fillRect(-50, -50, W + 100, H + 100); }
      this.fx.filter((f) => f.layer === 'top').forEach((f) => f.draw(ctx));
      if (this.spot) this.drawSpot();
      this.drawParticles(true);
      this.drawTexts();
      if (this.flash > 0.01) { ctx.fillStyle = `rgba(${this.flashColor},${this.flash})`; ctx.fillRect(-50, -50, W + 100, H + 100); }
      ctx.restore();
      this.drawOverlays();
      if (this.enemy && this.enemyBarVisible && this.bars < 0.5) this.drawEnemyBar();
      if (this.banner) this.drawBanner();
      if (this.fade > 0.01) { ctx.fillStyle = `rgba(0,0,0,${this.fade})`; ctx.fillRect(0, 0, W, H); }
      this.drawWarning();
    }

    drawActorShadow(a) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(a.x + a.ox, a.y + 4, a.h * 0.24, a.h * 0.05, 0, 0, TAU); ctx.fill();
      if (a.streak >= 2 && !a.ko) {
        glow(ctx, a.x + a.ox, a.y, a.h * 0.4, 'rgba(255,170,40,0.9)', 0.35 + 0.15 * Math.sin(this.t * 6));
      }
    }

    drawActor(a) {
      const sheet = Sprites.get(a.charId);
      if (!sheet || a.hidden) return;
      const ctx = this.ctx;
      let anim = a.anim.anim, frame = a.anim.frame();
      const opt = { alpha: a.alpha * (a.connected === false ? 0.55 : 1) };
      if (a.ko && anim === 'idle') {
        anim = 'hit'; frame = Sprites.frameCount(sheet, 'hit') - 1;
        opt.filter = 'grayscale(0.85) brightness(0.65)'; opt.alpha *= 0.8; opt.glow = false;
      } else if (a.flash > 0) {
        opt.filter = a.flash > 0.7 ? 'brightness(2.4)' : `sepia(1) saturate(6) hue-rotate(-45deg) brightness(${1 + a.flash * 0.4})`;
      }
      if (a.spawn > 0) opt.alpha *= 1 - a.spawn * 0.8;
      // bayangan jejak (afterimage) saat melesat
      if (a.trail && a.trail.length) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const g of a.trail) {
          Sprites.draw(ctx, sheet, g.anim, g.frame, g.x, g.y, a.h, { alpha: 0.3 * g.life, glow: false });
        }
        ctx.restore();
      }
      // idle bernapas
      const breath = anim === 'idle' && !a.ko ? Math.sin(this.t * 2.2 + a.x) * 0.012 : 0;
      ctx.save();
      ctx.translate(a.x + a.ox, a.y + a.oy);
      if (a.rot) ctx.rotate(a.rot);
      ctx.scale(1 - breath * 0.5, 1 + breath);
      Sprites.draw(ctx, sheet, anim, frame, 0, 0, a.h, opt);
      ctx.restore();
    }

    drawTag(a) {
      if (a.hidden) return;
      const ctx = this.ctx;
      const x = a.x + a.ox, y = a.y + 10;
      ctx.save();
      ctx.font = `800 ${Math.round(a.h * 0.12 + 6)}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const w = ctx.measureText(a.name).width + 18;
      ctx.fillStyle = 'rgba(10,6,24,0.72)';
      roundRect(ctx, x - w / 2, y, w, a.h * 0.12 + 14, 8); ctx.fill();
      ctx.strokeStyle = a.char.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(a.name, x, y + 4);
      // bar HP
      const bw = Math.max(60, w - 10), by = y + a.h * 0.12 + 18;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2, by, bw, 7);
      const k = clamp(a.hp / 100);
      ctx.fillStyle = k > 0.5 ? '#4ade80' : k > 0.25 ? '#facc15' : '#ef4444';
      ctx.fillRect(x - bw / 2, by, bw * k, 7);
      // tanda sudah menjawab
      if (this.questionActive) {
        const done = this.answered.has(a.id);
        const cy = a.y - a.h * 1.08, r = a.h * 0.09 + 6;
        ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU);
        ctx.fillStyle = done ? '#22c55e' : 'rgba(20,14,40,0.75)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = done ? '#bbf7d0' : 'rgba(255,255,255,0.4)'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${r * 1.2}px Nunito, sans-serif`;
        ctx.fillText(done ? '✔' : '…', x, cy + 1);
      }
      if (a.ko) {
        ctx.font = `900 ${a.h * 0.14}px Nunito, sans-serif`; ctx.fillStyle = '#fca5a5'; ctx.textBaseline = 'middle';
        ctx.fillText('💫 KO', x, a.y - a.h * 0.6);
      }
      ctx.restore();
    }

    drawEnemy() {
      const e = this.enemy;
      const ctx = this.ctx;
      const enterX = lerp(560, 0, e.enter);
      let alpha = e.alpha;
      let sink = 0;
      if (e.dying >= 0) {
        // musuh bersprite punya pose "mati": tampilkan dulu, baru memudar
        if (e.def.deathPose) alpha *= 1 - ease((e.dying - 0.65) / 0.35);
        else { alpha *= 1 - ease((e.dying - 0.4) / 0.6); sink = ease(e.dying) * 40; }
      }
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.translate(e.x + enterX + e.ox, e.y + sink);
      // lunge saat menyerang
      if (e.st.atk > 0) {
        const a = e.st.atk;
        const lunge = a < 0.4 ? 20 * (a / 0.4) : a < 0.65 ? 20 - 120 * ((a - 0.4) / 0.25) : -100 * (1 - (a - 0.65) / 0.35);
        ctx.translate(lunge, 0);
      }
      const sc = e.scale * (e.def.scaleFix || 1);
      // aura merah saat musuh bersiap menyerang (telegraph)
      if (e.rage > 0.02) {
        const pul = 0.75 + 0.25 * Math.sin(this.t * 14);
        glow(ctx, 0, -e.def.height * sc * 0.5, e.def.height * sc * 0.95, 'rgba(255,30,40,1)', 0.55 * e.rage * pul);
      }
      ctx.scale(sc, sc);
      if (e.squash > 0) { const q = e.squash; ctx.scale(1 + 0.07 * q, 1 - 0.07 * q); }
      ctx.globalAlpha = alpha;
      let filter = 'none';
      if (e.hitT > 0.8) filter = 'brightness(3)';
      else if (e.hitT > 0) filter = `brightness(${1 + e.hitT}) saturate(${1 + e.hitT})`;
      if (e.dying >= 0 && (!e.def.deathPose || e.dying < 0.12)) filter = `brightness(${1 + Math.abs(Math.sin(e.dying * 30)) * 1.5}) saturate(0.6)`;
      if (e.tint) filter = e.tint;
      ctx.filter = filter;
      e.def.draw(ctx, e.st);
      ctx.filter = 'none';
      ctx.restore();
      if (e.dying >= 0 && e.dying < 0.9 && Math.random() < 0.8) {
        const p = this.enemyHead();
        this.emit(p.x + rand(-150, 150), p.y + rand(-250, 250), e.def.color === '#fb923c' ? '255,120,40' : '170,90,255', rand(6, 14), 0, -rand(60, 200), 1.0);
      }
    }

    // world -> layar (untuk overlay yang mengikuti kamera)
    toScreen(x, y) {
      const v = this.view || { cx: W / 2, cy: H / 2, z: 1 };
      return { x: (x - v.cx) * v.z + W / 2, y: (y - v.cy) * v.z + H / 2 };
    }

    drawOverlays() {
      const ctx = this.ctx;
      ctx.save();
      // speed lines ala manga menuju titik fokus
      if (this.speed && this.speed.a > 0.02) {
        const c = this.toScreen(this.speed.x, this.speed.y);
        ctx.globalCompositeOperation = 'lighter';
        const n = 70;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * TAU + Math.random() * 0.08;
          const r0 = 260 + Math.random() * 260, r1 = 1500;
          const w = 2 + Math.random() * 7;
          ctx.strokeStyle = `rgba(${this.speed.color},${this.speed.a * (0.25 + Math.random() * 0.45)})`;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(c.x + Math.cos(ang) * r0, c.y + Math.sin(ang) * r0);
          ctx.lineTo(c.x + Math.cos(ang) * r1, c.y + Math.sin(ang) * r1);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // vignette bahaya (musuh bersiap) & terluka
      const red = Math.max(this.hurt, this.danger * (0.6 + 0.4 * Math.sin(this.t * 9)));
      if (red > 0.02) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
        g.addColorStop(0, 'rgba(120,0,0,0)');
        g.addColorStop(1, `rgba(200,0,10,${0.75 * red})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      // cinema bar
      if (this.bars > 0.01) {
        const bh = 120 * easeOut(this.bars);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      }
      // combo counter
      const cb = this.combo;
      if (cb && cb.hits > 1) {
        const a = cb.fade ? clamp(1 - (cb.t - cb.fade + 0.4) / 0.4) : 1;
        const pop = 1 + 0.35 * cb.pop;
        ctx.globalAlpha = a;
        ctx.translate(330, 330);
        ctx.rotate(-0.08);
        ctx.scale(pop, pop);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'italic 900 112px Nunito, system-ui, sans-serif';
        ctx.lineWidth = 16; ctx.strokeStyle = '#3b0a0a'; ctx.lineJoin = 'round';
        ctx.strokeText(String(cb.hits), 0, 0);
        const gg = ctx.createLinearGradient(0, -50, 0, 50);
        gg.addColorStop(0, '#fff7c2'); gg.addColorStop(0.5, '#facc15'); gg.addColorStop(1, '#f97316');
        ctx.fillStyle = gg; ctx.fillText(String(cb.hits), 0, 0);
        ctx.font = 'italic 900 40px Nunito, sans-serif';
        ctx.lineWidth = 8; ctx.strokeText('HIT COMBO', 0, 70);
        ctx.fillStyle = '#fff'; ctx.fillText('HIT COMBO', 0, 70);
        ctx.font = '800 26px Nunito, sans-serif';
        ctx.lineWidth = 6; ctx.strokeText(`${cb.dmg} damage`, 0, 112);
        ctx.fillStyle = '#fde68a'; ctx.fillText(`${cb.dmg} damage`, 0, 112);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
      }
      // callout besar (FINISH!, K.O.!, SERANGAN!)
      for (const c of this.callouts) {
        const k = c.t / c.dur;
        const inK = easeOut(c.t / 0.18);
        const sc = 1.8 - 0.8 * inK;
        const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(W / 2, c.y); ctx.rotate(-0.05); ctx.scale(sc, sc);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `italic 900 ${c.size}px Cinzel, Georgia, serif`;
        ctx.lineWidth = c.size * 0.12; ctx.strokeStyle = '#120414'; ctx.lineJoin = 'round';
        ctx.strokeText(c.text, 0, 0);
        ctx.fillStyle = c.color; ctx.fillText(c.text, 0, 0);
        if (c.sub) { ctx.font = '800 34px Nunito, sans-serif'; ctx.lineWidth = 7; ctx.strokeText(c.sub, 0, c.size * 0.62); ctx.fillStyle = '#fff'; ctx.fillText(c.sub, 0, c.size * 0.62); }
        ctx.restore();
      }
      // kartu nama boss: panel miring meluncur dari kiri
      if (this.bossCard) {
        const b = this.bossCard;
        const inK = easeOut(b.t / 0.35), outK = clamp((b.t - (b.dur - 0.4)) / 0.4);
        ctx.save();
        ctx.globalAlpha = 1 - outK;
        ctx.translate(-W * (1 - inK) - outK * 200, 0);
        ctx.transform(1, 0, -0.18, 1, 0, 0);
        const y0 = H * 0.62;
        const gg = ctx.createLinearGradient(0, 0, W * 0.75, 0);
        gg.addColorStop(0, 'rgba(10,0,0,0.92)'); gg.addColorStop(0.8, 'rgba(40,4,4,0.85)'); gg.addColorStop(1, 'rgba(40,4,4,0)');
        ctx.fillStyle = gg; ctx.fillRect(80, y0, W * 0.78, 230);
        ctx.fillStyle = b.color; ctx.fillRect(80, y0, W * 0.7, 6); ctx.fillRect(80, y0 + 224, W * 0.55, 4);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = '900 30px Nunito, sans-serif'; ctx.fillStyle = b.color;
        ctx.fillText(b.kicker, 230, y0 + 44);
        ctx.font = '900 104px Cinzel, Georgia, serif';
        ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.strokeText(b.name, 220, y0 + 122);
        const ng = ctx.createLinearGradient(0, y0 + 70, 0, y0 + 170);
        ng.addColorStop(0, '#fff7e0'); ng.addColorStop(1, b.color);
        ctx.fillStyle = ng; ctx.fillText(b.name, 220, y0 + 122);
        ctx.font = 'italic 800 32px Nunito, sans-serif'; ctx.fillStyle = '#fde68a';
        ctx.fillText(b.title, 236, y0 + 192);
        ctx.restore();
      }
      // impact frame: warna terbalik sesaat (gaya anime)
      if (this.impact > 0) {
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }

      // layar peringatan boss: pita merah berjalan atas-bawah
    drawWarning() {
      const ctx = this.ctx;
      if (this.warning) {
        ctx.save();
        const wt = this.warning.t;
        const a = clamp(wt / 0.25) * (this.warning.out ? clamp(1 - (wt - this.warning.out) / 0.35) : 1);
        if (a > 0.01) {
          ctx.globalAlpha = a;
          const pul = 0.5 + 0.5 * Math.sin(wt * 8);
          ctx.fillStyle = `rgba(150,0,10,${0.25 + 0.2 * pul})`; ctx.fillRect(0, 0, W, H);
          for (const [yy, dir] of [[H * 0.3, 1], [H * 0.7, -1]]) {
            ctx.save();
            ctx.translate(0, yy);
            ctx.fillStyle = '#facc15'; ctx.fillRect(0, -48, W, 96);
            ctx.beginPath(); ctx.rect(0, -48, W, 96); ctx.clip();
            ctx.fillStyle = '#111';
            const off = (wt * 260 * dir) % 80;
            for (let x = -160; x < W + 160; x += 80) { ctx.beginPath(); ctx.moveTo(x + off, -48); ctx.lineTo(x + off + 40, -48); ctx.lineTo(x + off, 48); ctx.lineTo(x + off - 40, 48); ctx.fill(); }
            ctx.restore();
          }
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = 'italic 900 150px Cinzel, Georgia, serif';
          ctx.lineWidth = 18; ctx.strokeStyle = '#120000'; ctx.lineJoin = 'round';
          ctx.strokeText('WARNING', W / 2, H * 0.5);
          ctx.fillStyle = `rgb(255,${60 + 60 * pul | 0},${60 + 60 * pul | 0})`; ctx.fillText('WARNING', W / 2, H * 0.5);
          ctx.font = '900 34px Nunito, sans-serif'; ctx.lineWidth = 8;
          ctx.strokeText(this.warning.text, W / 2, H * 0.5 + 105); ctx.fillStyle = '#fff'; ctx.fillText(this.warning.text, W / 2, H * 0.5 + 105);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
    }

    drawEnemyBar() {
      const e = this.enemy, ctx = this.ctx;
      const x = 1250, y = 34, w = 630, h = 30;
      ctx.save();
      ctx.fillStyle = 'rgba(12,6,26,0.78)';
      roundRect(ctx, x - 16, y - 8, w + 32, 96, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(250,204,21,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = '900 28px Cinzel, Georgia, serif'; ctx.fillStyle = '#fde68a'; ctx.textBaseline = 'top';
      ctx.fillText(e.name, x, y);
      ctx.font = '700 18px Nunito, sans-serif'; ctx.fillStyle = '#c4b5fd'; ctx.textAlign = 'right';
      ctx.fillText(`STAGE ${this.stage}/4${e.boss ? ` • FASE ${e.phase}/2` : ''}`, x + w, y + 6);
      if (e.boss) {
        const pul = this.enraged ? 0.6 + 0.4 * Math.sin(this.t * 10) : 1;
        ctx.textAlign = 'left';
        ctx.fillStyle = this.enraged ? `rgba(248,113,113,${pul})` : '#f97316';
        ctx.font = '900 16px Nunito, sans-serif';
        ctx.fillText(this.enraged ? '☠ BOSS • MENGAMUK' : '☠ BOSS', x, y - 26);
      }
      ctx.textAlign = 'left';
      const by = y + 40;
      ctx.fillStyle = '#1b0f22'; roundRect(ctx, x, by, w, h, 8); ctx.fill();
      const bar = clamp((e.barHp == null ? e.shownHp : e.barHp) / e.hpMax);
      const ghost = clamp(e.ghostHp == null ? bar : e.ghostHp);
      e.ghostHp = ghost + (bar - ghost) * 0.04;
      ctx.fillStyle = '#fbbf24'; roundRect(ctx, x, by, w * ghost, h, 8); ctx.fill();
      const g = ctx.createLinearGradient(0, by, 0, by + h);
      g.addColorStop(0, '#f87171'); g.addColorStop(1, '#b91c1c');
      if (this.enraged) ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 10);
      ctx.fillStyle = g; roundRect(ctx, x, by, w * bar, h, 8); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '800 18px Nunito, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.max(0, Math.round(e.barHp == null ? e.shownHp : e.barHp))} / ${e.hpMax}`, x + w / 2, by + h / 2 + 1);
      ctx.restore();
    }

    drawBarrier() {
      const ctx = this.ctx, k = this.barrier;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(640, 860, 100, 640, 860, 620);
      g.addColorStop(0, 'rgba(80,160,255,0)'); g.addColorStop(0.85, `rgba(90,170,255,${0.18 * k})`); g.addColorStop(1, `rgba(150,210,255,${0.5 * k})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(640, 900, 620, 420, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = `rgba(160,220,255,${0.7 * k})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(640, 900, 620, 420, 0, Math.PI, 0); ctx.stroke();
      ctx.restore();
    }

    drawParticles(top = false) {
      const ctx = this.ctx;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        if (!!p.top !== top) continue;
        const k = 1 - p.life / p.max;
        if (p.streak) {
          // percikan memanjang searah gerak (lebih tajam dari titik bulat)
          ctx.strokeStyle = `rgba(${p.color},${k})`; ctx.lineWidth = p.size * (0.3 + 0.5 * k); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); ctx.stroke();
          continue;
        }
        ctx.fillStyle = `rgba(${p.color},${k})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    drawTexts() {
      const ctx = this.ctx;
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const k = t.t / t.dur;
        const pop = t.t < 0.12 ? 0.6 + (t.t / 0.12) * 0.6 : t.t < 0.25 ? 1.2 - ((t.t - 0.12) / 0.13) * 0.2 : 1;
        ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        ctx.font = `900 ${t.size * pop}px Nunito, system-ui, sans-serif`;
        ctx.lineWidth = t.size * 0.16; ctx.strokeStyle = t.stroke; ctx.lineJoin = 'round';
        ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
      }
      ctx.restore();
    }

    drawBanner() {
      const b = this.banner, ctx = this.ctx;
      const k = b.t / b.dur;
      const inK = easeOut(b.t / 0.35), outK = k > 0.85 ? (k - 0.85) / 0.15 : 0;
      ctx.save();
      ctx.globalAlpha = 1 - outK;
      const y = 330;
      const w = W * inK;
      const g = ctx.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0);
      g.addColorStop(0, 'rgba(10,4,20,0)'); g.addColorStop(0.2, 'rgba(10,4,20,0.88)'); g.addColorStop(0.8, 'rgba(10,4,20,0.88)'); g.addColorStop(1, 'rgba(10,4,20,0)');
      ctx.fillStyle = g; ctx.fillRect(W / 2 - w / 2, y - 95, w, 190);
      ctx.fillStyle = b.color; ctx.fillRect(W / 2 - w / 2, y - 95, w, 4); ctx.fillRect(W / 2 - w / 2, y + 91, w, 4);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (b.title) { ctx.font = '800 34px Cinzel, Georgia, serif'; ctx.fillStyle = b.color; ctx.fillText(b.title, W / 2, y - 52); }
      ctx.font = '900 76px Cinzel, Georgia, serif';
      ctx.lineWidth = 10; ctx.strokeStyle = '#12051c'; ctx.strokeText(b.text, W / 2 + (1 - inK) * 200, y + 6);
      ctx.fillStyle = '#fff7e0'; ctx.fillText(b.text, W / 2 + (1 - inK) * 200, y + 6);
      if (b.sub) { ctx.font = '700 28px Nunito, sans-serif'; ctx.fillStyle = '#e9d5ff'; ctx.fillText(b.sub, W / 2, y + 62); }
      ctx.restore();
    }

    drawSpot() {
      const s = this.spot, ctx = this.ctx;
      const sheet = Sprites.get(s.charId); if (!sheet) return;
      const k = easeOut(s.t ? (performance.now() - s.t) / 400 : 1);
      ctx.save();
      glow(ctx, s.x, s.y - s.h * 0.5, s.h * 1.1, s.colorRgba, 0.55 * k);
      ctx.translate(s.x - (1 - k) * 120, s.y);
      Sprites.draw(ctx, sheet, 'ultimate', s.anim.frame(), 0, 0, s.h, { alpha: k, glowBoost: 0.6 });
      ctx.restore();
    }

    // ------------------------------------------------------------ koreografi
    actorMuzzle(a) {
      return { x: a.x + a.ox + a.h * 0.32, y: a.y - a.h * 0.55 };
    }

    async attack(a, r, scaleHp) {
      const ch = a.char;
      const sheet = Sprites.get(a.charId);
      const fps = ch.fps.attack;
      const nFrames = sheet ? Sprites.frameCount(sheet, 'attack') : 6;
      const impactDelay = (Math.min(ch.impact, nFrames - 1) / fps) * 1000;
      const type = ch.projectile;
      const color = TRAIL_COL[type] || '255,220,120';
      const sfx = ({ slash: Sfx.slash, fireball: Sfx.fire, holy: Sfx.holy, arrow: Sfx.arrow, dagger: Sfx.slash, shockwave: Sfx.slash })[type];
      if (MELEE.has(ch.id) && this.enemy) {
        // jarak dekat: melesat ke depan musuh dengan afterimage, tebas, lalu lompat kembali
        const e = this.enemy;
        const reach = e.def.width * 0.42 * (e.def.scaleFix || 1);
        const dx = (e.x - reach - a.h * 0.25 + rand(-40, 30)) - a.x;
        a.dashing = true; a.trailOn = true;
        Sfx.whoosh();
        await this.tween(170, (k) => { a.ox = dx * easeIn(k); a.oy = -Math.sin(k * Math.PI) * 24; });
        this.burst(a.x + a.ox, a.y, '230,220,200', 8, 260, 6, { grav: 200 });   // debu mendarat
        a.anim.set('attack', false);
        await this.wait(impactDelay);
        sfx();
        this.hitEnemy(r.damage, { color, ult: r.ultimate, hpDrop: r.damage * scaleHp });
        await this.wait(Math.max(90, ((nFrames - ch.impact) / fps) * 500));
        a.anim.set('idle', true);
        await this.tween(240, (k) => { a.ox = dx * (1 - easeOut(k)); a.oy = -Math.sin(k * Math.PI) * 70; });
        a.ox = 0; a.oy = 0; a.dashing = false; a.trailOn = false;
        return;
      }
      // jarak jauh: kilatan di tangan lalu proyektil berekor cahaya
      a.anim.set('attack', false, () => a.anim.set('idle', true));
      await this.wait(impactDelay);
      const from = this.actorMuzzle(a);
      const head = this.enemyHead();
      const to = { x: head.x + rand(-60, 40), y: head.y + rand(-90, 90) };
      this.burst(from.x, from.y, color, 8, 260, 7, { grav: 0 });
      a.ox = -10;  // hentakan mundur saat melepas serangan
      sfx();
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      return new Promise((res) => {
        this.projectile(type, from, to, dist / 2300, () => {
          this.hitEnemy(r.damage, { color, ult: r.ultimate, hpDrop: r.damage * scaleHp });
          res();
        });
      });
    }

    async ultimate(a, r, scaleHp) {
      const ch = a.char;
      const sheet = Sprites.get(a.charId);
      Sfx.ultimate();
      Sfx.charge();
      this.dimTarget = 0.72;
      this.barsT = 1;
      this.focus(660, 700, 1.12, 3);
      a.hidden = true;
      const anim = new Sprites.Animator(ch.id, ch.fps);
      anim.set('ultimate', false);
      const rgb = hexToRgb(ch.color);
      this.spot = { charId: ch.id, anim, x: 560, y: 960, h: 420, t: performance.now(), colorRgba: `rgba(${rgb},0.9)` };
      this.showBanner(`⚡ ULTIMATE — ${a.name} ⚡`, ch.ultimateName, ch.color, 2600);
      const n = sheet ? Sprites.frameCount(sheet, 'ultimate') : 4;
      const animMs = Math.min(1500, Math.max(1000, (n / ch.fps.ultimate) * 1000));
      for (let i = 0; i < 8; i++) this.burst(560, 760, rgb, 6, 300, 8, { grav: -50 });
      this.speed = { x: 560, y: 760, color: rgb, a: 0, aT: 0.85 };
      await this.wait(animMs + 150);
      this.speed.aT = 0;
      await this.ultimateFx(ch.ultimateFx, r, scaleHp, ch);
      this.spot = null;
      this.dimTarget = 0;
      this.barsT = 0;
      this.resetCam(3);
      a.hidden = false;
      a.anim.set('idle', true);
    }

    async ultimateFx(kind, r, scaleHp, ch) {
      const head = this.enemyHead();
      const e = this.enemy;
      const self = this;
      const hit = (color) => {
        // momen hantaman ultimate: impact frame, hit-stop, slow-motion, kamera mendekat
        this.impactFrame(90);
        this.focus(head.x, head.y + 30, 1.3, 9);
        this.hitEnemy(r.damage, { big: true, color, hpDrop: r.damage * scaleHp });
        this.slowMo(0.35, 650);
        this.flash = 0.6; this.flashColor = '255,240,220';
        Sfx.boom();
      };
      if (kind === 'meteor') {
        const from = { x: head.x + 500, y: -300 }, to = { x: head.x, y: head.y + 40 };
        await new Promise((res) => {
          this.fx.push({
            t: 0, dur: 0.9, layer: 'top',
            update() {
              const k = this.t / this.dur;
              const x = lerp(from.x, to.x, k * k), y = lerp(from.y, to.y, k * k);
              for (let i = 0; i < 4; i++) self.particles.push({ x: x + rand(-30, 30), y: y + rand(-30, 30), vx: rand(100, 300), vy: rand(-300, -100), life: 0, max: 0.6, size: rand(10, 22), color: '255,120,30', grav: 0, top: true });
              if (k >= 1 && !this.done) { this.done = true; res(); }
              return !this.done;
            },
            draw(ctx) {
              const k = this.t / this.dur;
              const x = lerp(from.x, to.x, k * k), y = lerp(from.y, to.y, k * k);
              glow(ctx, x, y, 200, 'rgba(255,110,20,1)', 0.9);
              ctx.fillStyle = '#3b1d10'; ctx.beginPath(); ctx.arc(x, y, 60, 0, TAU); ctx.fill();
              glow(ctx, x - 15, y + 15, 70, 'rgba(255,220,120,1)', 0.8);
            },
          });
        });
        hit('255,140,40');
        this.ring(head.x, head.y + 60, '255,140,40', 420);
        this.burst(head.x, head.y, '255,160,60', 70, 900, 14);
      } else if (kind === 'holy') {
        Sfx.holy();
        await this.pillar(head.x, '255,240,180', 900, 220);
        hit('255,240,190');
        if (this.lastReveal && this.lastReveal.heal) await this.partyHeal();
      } else if (kind === 'tornado') {
        const sheet = Sprites.get('pemanah');
        await new Promise((res) => {
          this.fx.push({
            t: 0, dur: 1.5, layer: 'top', hitDone: false,
            update() { if (this.t > 0.6 && !this.hitDone) { this.hitDone = true; hit('120,255,170'); } if (this.t > 1.4 && !this.d) { this.d = true; res(); } for (let i = 0; i < 3; i++) self.particles.push({ x: head.x + rand(-160, 160), y: e.y - rand(0, 500), vx: rand(-300, 300), vy: -rand(50, 200), life: 0, max: 0.6, size: rand(4, 9), color: '120,255,170', grav: 0, top: true }); },
            draw(ctx) {
              const k = this.t / this.dur;
              const a = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1;
              if (sheet) {
                ctx.save();
                ctx.translate(head.x + Math.sin(self.t * 20) * 8, e.y + 20);
                ctx.scale(1 + Math.sin(self.t * 13) * 0.05, 1);
                Sprites.drawFx(ctx, sheet, 'tornado', 0, -sheet.meta.fx.tornado[3] * 1.15, 2.3, { alpha: a, glowBoost: 1 });
                ctx.restore();
              }
            },
          });
        });
      } else if (kind === 'shadowx') {
        Sfx.slash(); await this.wait(120); Sfx.slash();
        await new Promise((res) => {
          this.fx.push({
            t: 0, dur: 1.0, layer: 'top',
            update() { if (this.t > 0.45 && !this.h) { this.h = true; hit('190,110,255'); } if (this.t > 0.9 && !this.d) { this.d = true; res(); } },
            draw(ctx) {
              const k = this.t;
              ctx.save(); ctx.globalCompositeOperation = 'lighter';
              ctx.translate(head.x, head.y); ctx.lineCap = 'round';
              for (const [s, d] of [[1, 0], [-1, 0.2]]) {
                const p = clamp((k - d) / 0.25);
                if (p <= 0) continue;
                const fade = clamp(1 - (k - d - 0.3) / 0.5);
                for (let i = 0; i < 3; i++) {
                  ctx.strokeStyle = `rgba(${200 - i * 30},${110 - i * 30},255,${fade * (0.9 - i * 0.25)})`;
                  ctx.lineWidth = 28 - i * 8;
                  ctx.beginPath(); ctx.moveTo(-320 * s, -320); ctx.lineTo(lerp(-320 * s, 320 * s, p), lerp(-320, 320, p)); ctx.stroke();
                }
              }
              ctx.restore();
            },
          });
        });
      } else if (kind === 'rune') {
        Sfx.holy();
        this.barrier = 1;
        await new Promise((res) => {
          this.fx.push({
            t: 0, dur: 1.4, layer: 'top',
            update() { if (this.t > 0.8 && !this.h) { this.h = true; hit('120,190,255'); } if (this.t > 1.3 && !this.d) { this.d = true; res(); } },
            draw(ctx) {
              const k = this.t / this.dur;
              runeCircle(ctx, 1100, 680, 170, self.t, clamp(k * 3));
              if (this.t > 0.6) {
                const b = clamp((this.t - 0.6) / 0.3);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                const g = ctx.createLinearGradient(1100, 0, head.x, 0);
                g.addColorStop(0, 'rgba(120,200,255,0.9)'); g.addColorStop(1, 'rgba(200,240,255,0.9)');
                ctx.fillStyle = g; ctx.globalAlpha = clamp(1.5 - k * 1.2);
                ctx.fillRect(1100, 680 - 50 * b, (head.x - 1100) * b, 100 * b);
                ctx.restore();
              }
            },
          });
        });
      } else if (kind === 'dragon') {
        Sfx.roar();
        await new Promise((res) => {
          this.fx.push({
            t: 0, dur: 1.4, layer: 'top',
            update() {
              if (this.t < 1.1) for (let i = 0; i < 8; i++) {
                const sx = 760, sy = 640, ang = Math.atan2(head.y - sy, head.x - sx) + rand(-0.12, 0.12), sp = rand(900, 1400);
                self.particles.push({ x: sx, y: sy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 0.6, size: rand(14, 30), color: Math.random() < 0.5 ? '255,120,30' : '255,200,80', grav: 0, top: true });
              }
              if (this.t > 0.5 && !this.h) { this.h = true; hit('255,130,40'); }
              if (this.t > 1.3 && !this.d) { this.d = true; res(); }
            },
            draw() {},
          });
        });
      } else { // flamesword
        Sfx.fire();
        const from = { x: 700, y: 760 }, to = { x: head.x, y: head.y };
        await new Promise((res) => {
          this.fx.push({
            t: 0, dur: 0.55, layer: 'top',
            update() { const k = this.t / this.dur; self.particles.push({ x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) + rand(-120, 120), vx: rand(-100, 100), vy: -rand(100, 300), life: 0, max: 0.6, size: rand(10, 20), color: '255,150,40', grav: 0, top: true }); if (k >= 1 && !this.d) { this.d = true; res(); } return !this.d; },
            draw(ctx) {
              const k = this.t / this.dur;
              ctx.save(); ctx.globalCompositeOperation = 'lighter';
              ctx.translate(lerp(from.x, to.x, k), lerp(from.y, to.y, k));
              for (let i = 0; i < 4; i++) {
                ctx.strokeStyle = `rgba(255,${230 - i * 40},${120 - i * 30},${0.95 - i * 0.2})`;
                ctx.lineWidth = 36 - i * 8;
                ctx.beginPath(); ctx.arc(-60 - i * 20, 0, 230, -1.25, 1.25); ctx.stroke();
              }
              ctx.restore();
            },
          });
        });
        hit('255,170,60');
        await this.pillar(head.x, '255,150,40', 500, 160);
      }
      await this.wait(350);
    }

    ring(x, y, color, maxR) {
      this.fx.push({
        t: 0, dur: 0.6, layer: 'top',
        draw(ctx) {
          const k = this.t / this.dur;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(${color},${1 - k})`; ctx.lineWidth = 30 * (1 - k) + 2;
          ctx.beginPath(); ctx.ellipse(x, y, maxR * easeOut(k), maxR * 0.35 * easeOut(k), 0, 0, TAU); ctx.stroke();
          ctx.restore();
        },
      });
    }

    pillar(x, color, ms, width) {
      return new Promise((res) => {
        const self = this;
        this.fx.push({
          t: 0, dur: ms / 1000, layer: 'top',
          update() { if (this.t >= this.dur * 0.6 && !this.d) { this.d = true; res(); } self.particles.push({ x: x + rand(-width / 2, width / 2), y: rand(200, 950), vx: 0, vy: -rand(100, 300), life: 0, max: 0.6, size: rand(4, 10), color, grav: 0, top: true }); },
          draw(ctx) {
            const k = this.t / this.dur;
            const w = width * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) * 0.8);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
            g.addColorStop(0, `rgba(${color},0)`); g.addColorStop(0.5, `rgba(${color},${0.95 * (1 - k * 0.6)})`); g.addColorStop(1, `rgba(${color},0)`);
            ctx.fillStyle = g; ctx.fillRect(x - w / 2, 0, w, ENEMY_Y + 30);
            ctx.restore();
          },
        });
      });
    }

    async partyHeal() {
      Sfx.heal();
      for (const a of this.actors.values()) {
        this.burst(a.x, a.y - a.h * 0.5, '140,255,160', 10, 200, 6, { grav: -100 });
        this.addText(a.x, a.y - a.h - 20, '+40', '#86efac', 40);
      }
      await this.wait(600);
    }

    async enemyCounter(targets, payload) {
      const e = this.enemy;
      if (!e || !targets.length) return;
      const key = e.key === 'demonking' ? 'demonking' + e.phase : e.key;
      // musuh bersprite memakai skill bila banyak yang salah
      const SKILL_NAMES = { wolf: 'Lolongan Kristal!', golem: 'Gempa Kristal!', lavaknight: 'Tebasan Magma!', hellfire: 'Erupsi Neraka!' };
      const ratio = e.boss ? 0.4 : 0.5;   // boss lebih sering memakai skill, dan selalu saat mengamuk
      const useSkill = !!SKILL_NAMES[key] && (targets.length >= Math.max(2, this.actors.size * ratio) || (e.boss && this.enraged));
      const sc = e.def.scaleFix || 1;
      const head = this.enemyHead();
      const pc = this.partyCenter();
      this.combo = null;
      // boss: lingkaran peringatan merah di bawah setiap sasaran
      const marks = e.boss ? targets.map((t) => this.actors.get(t.id)).filter(Boolean).map((a) => this.warnMark(a)) : [];

      // 1) TELEGRAPH: kamera mendekat ke musuh, aura merah, layar berdenyut bahaya
      this.barsT = 1;
      this.focus(e.x - 40, e.y - e.def.height * sc * 0.55, 1.32, 5);
      e.rageT = 1; this.dangerT = 0.75;
      Sfx.warn();
      this.callout(useSkill ? SKILL_NAMES[key] : 'AWAS!', useSkill ? '#e9d5ff' : '#fca5a5', {
        size: useSkill ? 104 : 96, y: H * 0.22, dur: 1.25,
        sub: `${targets.length} petualang menjadi sasaran!`,
      });
      if (useSkill && key === 'lavaknight') {
        // ksatria lava tidak punya pose skill: angkat pedang lama, lalu hantam
        e.st.pose = 'idle2';
        this.speed = { x: head.x, y: head.y, color: '255,120,30', a: 0, aT: 0.85 };
        Sfx.charge(); Sfx.rumble(); this.shake = 18;
        await this.wait(800);
        e.st.pose = null;
        e.atkT = 0.4; e.atkDur = 0.9;
        Sfx.enemyAttack();
        await this.wait(250);
      } else if (useSkill) {
        e.skillT = 0; e.skillDur = 1.7;
        this.speed = { x: head.x, y: head.y, color: '190,120,255', a: 0, aT: 0.8 };
        Sfx.roar(); this.shake = key === 'golem' ? 26 : 16;
        await this.wait(950);
      } else {
        await this.wait(480);
        e.atkT = 0; e.atkDur = e.boss ? 1.3 : 1.0;
        Sfx.enemyAttack();
        await this.wait(360);
      }

      // 2) RELEASE: whip-pan cepat ke party, serangan meluncur
      e.rageT = 0; this.dangerT = 0;
      if (this.speed) this.speed.aT = 0;
      marks.forEach((m) => { m.done = true; });
      this.focus(pc + 80, 760, 1.1, 11);
      let firstHit = true, koCount = 0;
      const proms = targets.map((t, i) => new Promise((res) => {
        const a = this.actors.get(t.id);
        if (!a) return res();
        const doHit = () => {
          a.flash = 1;
          if (t.hit > 0) {
            a.anim.set('hit', false, () => { a.anim.set('idle', true); res(); });
            // knockback: terpental ke belakang dan sedikit terangkat
            a.ox = -rand(55, 85); a.oy = -rand(14, 26); a.rot = -0.14;
            this.addText(a.x + rand(-20, 20), a.y - a.h - 10, `-${t.hit}`, '#f87171', 58, { stroke: '#450a0a' });
            this.sparks(a.x, a.y - a.h * 0.55, '255,90,90', 10, 800, Math.PI);
            this.burst(a.x, a.y - a.h * 0.5, '255,90,90', 8, 280, 6);
            this.hurt = Math.min(1, this.hurt + 0.3);
            this.kick.x -= 7;
            a.hp = t.hp;
            Sfx.hurt();
            if (firstHit) { firstHit = false; this.hitStop(80); }
            if (t.koNow) {
              koCount++;
              this.after(450, () => { a.ko = true; this.burst(a.x, a.y - 20, '200,200,220', 14, 220, 7, { grav: 200 }); });
            }
          } else res();
          this.shake = Math.max(this.shake, 10);
        };
        const to = { x: a.x, y: a.y - a.h * 0.55 };
        this.after(i * Math.min(80, 800 / targets.length), () => {
          if (key === 'wolf') {
            if (useSkill) this.projectile('shard', { x: a.x + rand(-60, 120), y: -80 }, to, 0.42, doHit);
            else this.projectile('claw', { x: head.x - 160, y: head.y }, to, 0.34, doHit);
          } else if (key === 'golem') {
            if (useSkill) this.crystalSpike(a, doHit);
            else this.projectile('rock', { x: head.x - 200, y: e.y - 40 }, to, 0.45, doHit);
          } else if (key === 'lavaknight') {
            if (useSkill) this.lavaGeyser(a, doHit, '255,120,30');
            else this.projectile('fireWave', { x: e.x - 180, y: e.y - 30 }, { x: a.x, y: a.y - a.h * 0.3 }, 0.4, doHit);
          } else if (key === 'hellfire') {
            if (useSkill) { this.lavaGeyser(a, doHit, '255,80,20'); if (i % 2 === 0) this.skyFire(a, () => {}); }
            else this.projectile('fireClaw', { x: head.x - 200, y: head.y + 20 }, to, 0.34, doHit);
          } else if (key === 'slime') this.projectile('blob', { x: head.x - 80, y: head.y }, to, 0.5, doHit);
          else if (key === 'skeleton') this.projectile('boneSlash', { x: head.x - 120, y: head.y }, to, 0.38, doHit);
          else if (key === 'general') this.projectile('orb', { x: head.x - 150, y: head.y + 40 }, to, 0.42, doHit);
          else if (key === 'demonking1') { this.bolt(a.x, a.y, '200,120,255'); this.after(120, doHit); } else { this.skyFire(a, doHit); }
        });
      }));
      if (payload.shield) {
        this.addText(640, 470, 'Perisai Rune! Serangan ½', '#93c5fd', 42, { dur: 1.8 });
      }
      await Promise.all(proms);
      if (koCount) {
        // momen dramatis saat ada yang pingsan
        this.slowMo(0.35, 700);
        this.callout('K.O.!', '#f87171', { size: 150, y: H * 0.38, dur: 1.5, sub: `${koCount} petualang pingsan — jawab benar untuk bangkit!` });
        Sfx.ko();
        await this.wait(450);
      }
      await this.wait(250);
      this.barsT = 0;
      this.resetCam(3);
    }

    // Pukulan penghabisan: slow-motion, impact frame, kamera menempel ke musuh
    async finisher() {
      const e = this.enemy; if (!e) return;
      const p = this.enemyHead();
      this.barsT = 1;
      this.focus(p.x, p.y + 40, 1.38, 8);
      this.impactFrame(110);
      this.hitStop(130);
      this.slowMo(0.22, 1100);
      this.flash = 0.7; this.flashColor = '255,255,255';
      this.sparks(p.x, p.y, '255,240,200', 40, 1700, null, true);
      this.burst(p.x, p.y, '255,230,160', 40, 900, 10);
      this.shake = 34;
      this.callout('FINISH!', '#fde047', { size: 170, dur: 1.7, sub: `${e.name} tumbang!` });
      Sfx.boom(); Sfx.crit();
      await this.wait(420);
    }

    // Lingkaran bahaya berdenyut di tanah di bawah karakter (telegraph boss)
    warnMark(a) {
      const self = this;
      const m = {
        t: 0, dur: 99, layer: 'back', done: false,
        update() { return !this.done; },
        draw(ctx) {
          const k = clamp(this.t / 0.3);
          const pul = 0.6 + 0.4 * Math.sin(self.t * 16);
          ctx.save();
          ctx.translate(a.x, a.y + 4);
          ctx.scale(1, 0.32);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(255,40,40,${0.9 * pul * k})`; ctx.lineWidth = 8;
          ctx.beginPath(); ctx.arc(0, 0, a.h * 0.42 * (1.4 - 0.4 * k), 0, TAU); ctx.stroke();
          ctx.fillStyle = `rgba(255,30,30,${0.22 * pul * k})`;
          ctx.beginPath(); ctx.arc(0, 0, a.h * 0.42, 0, TAU); ctx.fill();
          ctx.restore();
        },
      };
      this.fx.push(m);
      return m;
    }

    // Semburan lava dari tanah di bawah karakter
    lavaGeyser(a, cb, rgb = '255,110,20') {
      const self = this;
      let hit = false;
      Sfx.fire();
      this.fx.push({
        t: 0, dur: 1.0, layer: 'front',
        update() {
          if (this.t > 0.22 && !hit) { hit = true; self.shake = Math.max(self.shake, 14); cb(); }
          if (this.t < 0.6) for (let i = 0; i < 3; i++) self.particles.push({ x: a.x + rand(-30, 30), y: a.y, vx: rand(-90, 90), vy: -rand(500, 900), life: 0, max: rand(0.4, 0.7), size: rand(6, 12), color: Math.random() < 0.5 ? rgb : '255,210,90', grav: 1400 });
        },
        draw(ctx) {
          const k = this.t / this.dur;
          const grow = k < 0.25 ? easeOut(k / 0.25) : 1;
          const fade = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1;
          const hh = a.h * 1.5 * grow, w = a.h * 0.32;
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade;
          const g = ctx.createLinearGradient(0, a.y - hh, 0, a.y);
          g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.3, `rgba(${rgb},0.9)`); g.addColorStop(1, 'rgba(255,230,140,1)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(a.x - w, a.y); ctx.quadraticCurveTo(a.x - w * 0.4, a.y - hh * 0.6, a.x, a.y - hh);
          ctx.quadraticCurveTo(a.x + w * 0.4, a.y - hh * 0.6, a.x + w, a.y); ctx.closePath(); ctx.fill();
          glow(ctx, a.x, a.y - 20, a.h * 0.7, `rgba(${rgb},1)`, 0.7 * fade);
          ctx.restore();
        },
      });
    }

    // Paku kristal muncul dari tanah di bawah karakter
    crystalSpike(a, cb) {
      const self = this;
      let hit = false;
      Sfx.impact();
      this.fx.push({
        t: 0, dur: 0.9, layer: 'front',
        update() { if (this.t > 0.25 && !hit) { hit = true; self.shake = Math.max(self.shake, 10); cb(); } },
        draw(ctx) {
          const k = this.t / this.dur;
          const grow = k < 0.3 ? easeOut(k / 0.3) : 1;
          const fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
          ctx.save(); ctx.translate(a.x, a.y + 6); ctx.globalAlpha = fade;
          for (const [dx, h, w] of [[-22, 0.7, 14], [0, 1, 18], [24, 0.6, 12]]) {
            const hh = a.h * 0.75 * h * grow;
            ctx.fillStyle = '#818cf8'; ctx.strokeStyle = '#1e1b4b'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(dx - w, 0); ctx.lineTo(dx, -hh); ctx.lineTo(dx + w, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(224,231,255,0.7)';
            ctx.beginPath(); ctx.moveTo(dx - 2, -4); ctx.lineTo(dx, -hh * 0.9); ctx.lineTo(dx + w * 0.4, -4); ctx.fill();
          }
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, 0, -a.h * 0.3, a.h * 0.6, 'rgba(110,130,255,1)', 0.5 * fade);
          ctx.restore();
        },
      });
    }

    bolt(x, y, color) {
      this.lightning = 0.8;
      const pts = [];
      let px = x + rand(-80, 80), py = -20;
      while (py < y - 40) { pts.push([px, py]); px += rand(-50, 50); py += rand(60, 120); }
      pts.push([x, y - 40]);
      this.fx.push({
        t: 0, dur: 0.45, layer: 'top',
        draw(ctx) {
          const k = this.t / this.dur;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (const [w, a] of [[16, 0.4], [6, 1]]) {
            ctx.strokeStyle = `rgba(${color},${a * (1 - k)})`; ctx.lineWidth = w;
            ctx.beginPath(); pts.forEach(([px2, py2], i) => (i ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2))); ctx.stroke();
          }
          ctx.restore();
        },
      });
      Sfx.impact();
    }

    skyFire(a, cb) {
      const from = { x: a.x + 300, y: -100 }, to = { x: a.x, y: a.y - a.h * 0.4 };
      this.projectile('orb', from, to, 0.55, () => { this.ring(to.x, a.y, '255,110,30', 120); cb(); });
    }

    async enemyDeath() {
      const e = this.enemy; if (!e) return;
      e.st.pose = null;
      if (e.boss) {
        // ledakan beruntun di tubuh boss sebelum tumbang
        this.barsT = 1;
        this.focus(e.x - 40, e.y - 200, 1.25, 3);
        for (let i = 0; i < 6; i++) {
          const p = this.enemyHead();
          const x = p.x + rand(-160, 120), y = p.y + rand(-200, 160);
          this.burst(x, y, i % 2 ? '255,200,120' : '255,110,40', 30, 700, 10);
          this.sparks(x, y, '255,230,180', 16, 1200, null, true);
          this.flash = 0.4; this.flashColor = '255,200,150';
          this.shake = 24; e.hitT = 1;
          Sfx.boom();
          await this.wait(230);
        }
      }
      Sfx.boom();
      this.shake = 30;
      await this.tween(1700, (k) => { e.dying = k; this.shake = Math.max(this.shake, 14 * (1 - k)); });
      const p = this.enemyHead();
      this.burst(p.x, p.y, '255,230,180', 80, 1000, 12);
      this.flash = 0.8; this.flashColor = '255,250,230';
      e.alpha = 0;
    }

    async partyCelebrate() {
      for (const a of this.actors.values()) {
        if (a.ko) continue;
        a.anim.set('ultimate', false, () => a.anim.set('idle', true), 8);
      }
      await this.wait(900);
      for (const a of this.actors.values()) a.anim.set('idle', true);
    }

    async partyWalk(ms = 2200) {
      for (const a of this.actors.values()) { a.ko = false; a.anim.set('walk', true); }
      const start = this.scroll;
      await this.tween(ms, (k) => { this.scroll = start + k * 900; });
      for (const a of this.actors.values()) a.anim.set('idle', true);
    }

    async transitionTo(next) {
      this.showBanner('', 'MUSUH DIKALAHKAN!', '#facc15', 1800, 'Party bergerak menuju musuh berikutnya…');
      Sfx.stageClear();
      await this.partyCelebrate();
      const walk = this.partyWalk(2400);
      await this.wait(1600);
      this.fadeTarget = 1;
      await walk;
      await this.wait(300);
      this.scroll = 0;
      if (next.boss) { await this.bossIntro(next); return; }
      this.setEnemy(next, { entrance: true });
      this.fadeTarget = 0;
      await this.wait(500);
      await this.enemyEntrance();
    }

    // ================================================================ INTRO BOSS
    // Layar WARNING -> kamera menyapu benteng -> bumi bergetar -> boss muncul dari
    // pilar api -> close-up + raungan -> kartu nama -> kamera mundur ke posisi tempur.
    async bossIntro(next) {
      const color = next.key === 'demonking' ? '#c084fc' : '#f97316';
      const rgb = next.key === 'demonking' ? '190,110,255' : '255,120,30';
      // 1) peringatan di layar hitam
      this.enemyBarVisible = false;
      this.warning = { t: 0, text: `Boss Stage ${next.stage} mendekat — bersiaplah, para petualang!` };
      Sfx.alarm(); this.after(900, () => Sfx.alarm());
      Sfx.heartbeat(); this.after(700, () => Sfx.heartbeat());
      await this.wait(1900);
      this.warning.out = this.warning.t;
      // 2) kamera melayang tinggi di atas medan, lalu turun perlahan
      this.setEnemy(next, { entrance: false });
      const e = this.enemy;
      e.alpha = 0;
      this.barsT = 1;
      this.cam = { x: W * 0.62, y: H * 0.32, z: 1.45 };
      this.focus(W * 0.62, H * 0.32, 1.45, 30);
      this.fadeTarget = 0;
      await this.wait(400);
      this.warning = null;
      this.focus(ENEMY_X - 120, 640, 1.25, 0.9);
      Sfx.rumble();
      await this.tween(1800, (k) => {
        this.shake = 3 + 12 * k;
        if (Math.random() < 0.5) this.emit(ENEMY_X + rand(-300, 200), ENEMY_Y + rand(-20, 20), rgb, rand(4, 9), rand(-40, 40), -rand(120, 360), 0.9);
      });
      // 3) boss muncul dari pilar api + gelombang kejut
      const p = this.pillar(e.x, rgb, 900, 300);
      Sfx.fire();
      await this.wait(260);
      e.alpha = 1; e.squash = 1;
      this.impactFrame(100);
      this.hitStop(120);
      this.flash = 0.75; this.flashColor = '255,230,200';
      this.shake = 34;
      this.ring(e.x, ENEMY_Y, rgb, 520);
      this.burst(e.x, ENEMY_Y - 40, rgb, 60, 900, 12);
      for (const a of this.actors.values()) { a.ox = -rand(20, 40); a.flash = 0.4; }   // party terdorong angin
      Sfx.boom();
      await p;
      // 4) close-up raungan
      const head = this.enemyHead();
      this.focus(head.x + 20, head.y + 40, 1.55, 6);
      e.st.pose = next.key === 'lavaknight' ? 'idle2' : 'roar';
      e.skillT = 0; e.skillDur = 1.6;
      this.speed = { x: head.x, y: head.y, color: rgb, a: 0, aT: 0.9 };
      Sfx.roar();
      this.shake = 22;
      this.slowMo(0.6, 700);
      await this.wait(1000);
      // 5) kartu nama
      this.speed.aT = 0;
      this.bossCard = { t: 0, dur: 2.8, name: next.name, title: next.title, kicker: `☠  BOSS  •  STAGE ${next.stage}`, color };
      Sfx.boom();
      await this.wait(2400);
      e.st.pose = null;
      // 6) kembali ke posisi tempur
      this.barsT = 0;
      this.resetCam(1.8);
      this.enemyBarVisible = true;
      await this.wait(700);
    }

    // ================================================================ TRANSFORMASI BOSS
    // Boss tumbang -> hening + detak jantung -> "Belum berakhir!" -> kebangkitan -> fase 2.
    async bossTransform(next) {
      const e = this.enemy;
      const toLava = next.key === 'hellfire';
      const rgb = toLava ? '255,110,20' : '255,60,40';
      // 1) tumbang
      e.st.pose = 'defeat';
      this.barsT = 1;
      const head = this.enemyHead();
      this.focus(e.x - 40, e.y - 140, 1.3, 2);
      this.callout('…', '#e5e7eb', { size: 160, y: H * 0.36, dur: 1.4 });
      Sfx.heartbeat(); await this.wait(900);
      Sfx.heartbeat(); this.dimTarget = 0.35; await this.wait(800);
      // 2) belum berakhir: retakan lava, kamera mendekat, getaran membesar
      this.callout('BELUM BERAKHIR!', '#fca5a5', { size: 120, y: H * 0.28, dur: 1.8 });
      Sfx.heartbeat(); Sfx.rumble();
      e.rageT = 1; this.dangerT = 0.8;
      if (e.def.sprite && Enemies.def(e.key).sprite) e.st.pose = toLava ? 'transform' : 'defeat';
      this.focus(head.x, head.y + 60, 1.5, 1.6);
      await this.tween(1800, (k) => {
        this.shake = 4 + 22 * k;
        for (let i = 0; i < 3; i++) this.emit(e.x + rand(-160, 160), e.y - rand(0, 420 * k), rgb, rand(6, 13), 0, -rand(150, 420), 0.8);
        if (!toLava && Math.random() < 0.08) this.bolt(e.x + rand(-300, 300), e.y, rgb);
      });
      // 3) ledakan kebangkitan
      this.impactFrame(120);
      this.hitStop(160);
      this.flash = 1; this.flashColor = toLava ? '255,170,80' : '255,80,60';
      this.setEnemy(next, { entrance: false });
      const ne = this.enemy;
      ne.rageT = 1;
      ne.st.pose = 'roar';
      ne.scale = 0.6;
      this.dimTarget = 0; this.dangerT = 0;
      this.ring(ne.x, ENEMY_Y, rgb, 700);
      this.burst(ne.x, ne.y - 300, rgb, 110, 1300, 14);
      for (const a of this.actors.values()) { a.ox = -rand(40, 70); a.flash = 0.6; }
      Sfx.boom(); Sfx.roar();
      const nh = this.enemyHead();
      this.focus(nh.x, nh.y + 80, 1.35, 5);
      this.speed = { x: nh.x, y: nh.y, color: rgb, a: 0, aT: 1 };
      this.slowMo(0.45, 900);
      this.callout('FASE 2', '#fb923c', { size: 170, y: H * 0.3, dur: 1.8 });
      await this.tween(1100, (k) => { ne.scale = 0.6 + 0.4 * easeOut(k); this.shake = 26 * (1 - k) + 6; });
      await this.wait(500);
      this.speed.aT = 0;
      this.bossCard = { t: 0, dur: 2.6, name: next.name, title: next.title, kicker: `☠  BOSS  •  FASE 2`, color: toLava ? '#ef4444' : '#fb923c' };
      Sfx.boom();
      await this.wait(2300);
      ne.st.pose = null; ne.rageT = 0;
      this.barsT = 0;
      this.resetCam(1.8);
      await this.wait(600);
    }

    // Animasi lengkap satu soal
    async playReveal(payload) {
      this.lastReveal = payload;
      this.questionActive = false;
      const res = payload.results;
      const e = this.enemy;
      if (e) { e.hp = payload.enemy.hpBefore; e.shownHp = payload.enemy.hpBefore; }
      const scaleHp = payload.enemy.damage > 0 ? (payload.enemy.hpBefore - payload.enemy.hpAfter) / payload.enemy.damage : 0;

      const correct = res.filter((r) => r.correct && this.actors.has(r.id));
      const ults = correct.filter((r) => r.ultimate);
      const featured = ults.slice(0, 2);
      const normal = correct.filter((r) => !featured.includes(r));

      // bangkit dari KO
      for (const r of res) {
        if (r.revived) {
          const a = this.actors.get(r.id);
          if (a) { a.ko = false; a.hp = r.hp; this.addText(a.x, a.y - a.h - 30, 'BANGKIT!', '#fde68a', 34); }
        }
      }

      if (correct.length === 0) {
        this.callout('MELESET…', '#94a3b8', { size: 110, dur: 1.6, sub: 'Tidak ada yang menjawab benar' });
        Sfx.wrong();
        await this.wait(1000);
      } else {
        // 1) aba-aba: kamera ke party, kilau emas pada yang menjawab benar
        const pc = this.partyCenter();
        this.combo = { hits: 0, dmg: 0, t: 0, pop: 0 };
        this.focus(pc + 60, 720, 1.1, 6);
        Sfx.charge();
        this.callout('SERANGAN!', '#fde68a', { size: 110, y: H * 0.26, dur: 0.95, sub: `${correct.length} petualang menjawab benar` });
        for (const r of correct) {
          const a = this.actors.get(r.id);
          a.flash = 0.6;
          this.burst(a.x, a.y - a.h * 0.5, '255,220,120', 8, 220, 6, { grav: -80 });
        }
        await this.wait(480);
        // 2) serangan beruntun: kamera menyorot medan, lalu menempel ke musuh
        this.focus((pc + ENEMY_X) / 2 + 80, 720, 1.04, 3);
        const step = Math.min(110, 1400 / Math.max(1, normal.length));
        this.after(step * normal.length * 0.5 + 250, () => this.focus(ENEMY_X - 160, 640, 1.16, 3));
        const proms = normal.map((r, i) => this.wait(i * step).then(() => this.attack(this.actors.get(r.id), r, scaleHp)));
        await Promise.all(proms);
        if (this.combo) this.combo.fade = 1.3;
        await this.wait(250);
        for (const r of featured) await this.ultimate(this.actors.get(r.id), r, scaleHp);
        if (!payload.enemy.defeated) this.resetCam(2.5);
      }
      if (payload.heal && !featured.some((r) => this.actors.get(r.id) && this.actors.get(r.id).charId === 'biarawati')) await this.partyHeal();
      if (e) { e.hp = payload.enemy.hpAfter; e.shownHp = payload.enemy.hpAfter; }
      for (const r of res) { const a = this.actors.get(r.id); if (a && r.correct) { a.hp = r.hp; a.streak = r.streak; } }

      if (payload.enemy.held) {
        this.addText(e.x - 100, e.y - e.def.height * 0.9, 'Musuh masih bertahan!', '#fde68a', 40, { dur: 1.8, vy: -20 });
      }

      // serangan balik musuh
      const targets = res.filter((r) => !r.correct && this.actors.has(r.id) && r.hit > 0);
      for (const r of res) { const a = this.actors.get(r.id); if (a && !r.correct) a.streak = 0; }
      if (!payload.enemy.defeated && targets.length) await this.enemyCounter(targets, payload);
      this.barrier = 0;

      if (payload.enemy.defeated) {
        await this.finisher();
        const sameStage = payload.next && payload.next.stage === this.stage;   // boss berganti fase
        if (!sameStage) await this.enemyDeath();
        this.barsT = 0;
        this.resetCam(2);
        if (payload.next) {
          if (sameStage) await this.bossTransform(payload.next);
          else await this.transitionTo(payload.next);
          for (const a of this.actors.values()) { a.hp = 100; a.ko = false; }
        }
      }
      this.barsT = 0; this.dangerT = 0;
      this.resetCam(2);
      if (this.combo) this.combo.fade = this.combo.fade || 0.8;
      await this.wait(300);
    }

    async playIntro(enemy) {
      this.setEnemy(enemy, { entrance: true });
      this.showBanner('', 'PETUALANGAN DIMULAI!', '#facc15', 2000, 'Kalahkan pasukan Raja Iblis dengan menjawab soal!');
      await this.partyWalk(1800);
      await this.enemyEntrance();
    }

    async playVictory() {
      Sfx.victory();
      this.showBanner('', 'KEMENANGAN!', '#facc15', 3500, 'Raja Iblis telah dikalahkan. Dunia kembali damai!');
      for (let i = 0; i < 6; i++) { this.burst(rand(300, 1600), rand(200, 500), ['255,220,100', '140,255,180', '200,150,255'][i % 3], 50, 700, 9); await this.wait(350); }
      await this.partyCelebrate();
    }

    async playDefeat() {
      Sfx.defeat();
      this.showBanner('', 'PARTY MUNDUR…', '#f87171', 3500, 'Raja Iblis masih berkuasa. Latih lagi dan coba kembali!');
      await this.wait(1500);
    }
  }

  function runeCircle(ctx, x, y, r, t, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.translate(x, y); ctx.scale(0.45, 1);
    ctx.strokeStyle = 'rgba(140,210,255,0.95)';
    ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU); ctx.stroke();
    ctx.rotate(t * 1.5);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const ang = (i / 6) * TAU; const ang2 = ang + (2 * TAU) / 6; ctx.moveTo(Math.cos(ang) * r * 0.8, Math.sin(ang) * r * 0.8); ctx.lineTo(Math.cos(ang2) * r * 0.8, Math.sin(ang2) * r * 0.8); }
    ctx.stroke();
    for (let i = 0; i < 24; i++) { const ang = (i / 24) * TAU; ctx.fillStyle = 'rgba(190,235,255,0.9)'; ctx.fillRect(Math.cos(ang) * r * 0.91 - 3, Math.sin(ang) * r * 0.91 - 3, 6, 6); }
    ctx.restore();
    glow(ctx, x, y, r * 1.2, 'rgba(100,180,255,1)', 0.4 * a);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  window.Battle = Battle;
})();
