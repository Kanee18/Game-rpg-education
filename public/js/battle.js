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

    wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
        hp: info.hp, hpMax: info.hpMax, shownHp: info.hp,
        x: ENEMY_X, y: ENEMY_Y, ox: 0, oy: 0, st: { t: 0, atk: 0 },
        atkT: -1, hitT: 0, alpha: entrance ? 0 : 1, enter: entrance ? 0 : 1, dying: -1, scale: 1,
      };
      if (info.stage) { this.stage = info.stage; this.phase = info.phase || 1; }
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
      this.showBanner(e.title ? `STAGE ${this.stage}` : '', e.name, e.def.color, 2200, e.title);
      await this.wait(900);
    }

    tween(ms, fn) {
      return new Promise((res) => {
        const start = performance.now();
        const step = () => {
          const k = clamp((performance.now() - start) / ms);
          fn(k);
          if (k < 1) requestAnimationFrame(step); else res();
        };
        step();
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

    emit(x, y, color, size = 8, vx = 0, vy = 0, life = 0.5, grav = 0) {
      this.particles.push({ x, y, vx: vx + rand(-40, 40), vy: vy + rand(-40, 40), life: 0, max: life, size, color, grav, add: true });
    }

    hitEnemy(dmg, opts = {}) {
      const e = this.enemy; if (!e) return;
      e.hitT = 1;
      e.ox = opts.big ? 40 : 18;
      const p = this.enemyHead();
      const col = opts.color || '255,220,120';
      this.burst(p.x + rand(-40, 40), p.y + rand(-60, 60), col, opts.big ? 40 : 14, opts.big ? 700 : 380, opts.big ? 10 : 6);
      if (dmg != null) {
        this.addText(p.x + rand(-150, 110), p.y + rand(-220, 60), String(dmg), opts.big ? '#ffd23f' : '#ffffff', opts.big ? 92 : 50, { vy: -90 });
      }
      if (opts.hpDrop) e.shownHp = Math.max(0, e.shownHp - opts.hpDrop);
      this.shake = Math.max(this.shake, opts.big ? 22 : 6);
      Sfx.impact();
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
          if (type === 'fireball' || type === 'orb') self.emit(p.x, p.y, type === 'orb' ? '255,120,40' : '255,140,40', 10, -120, rand(-30, 30), 0.35);
          if (type === 'holy') self.emit(p.x, p.y, '255,240,170', 6, rand(-80, 80), rand(-80, 80), 0.4);
          if (type === 'dagger') self.emit(p.x, p.y, '190,120,255', 5, -60, 0, 0.25);
          if (type === 'arrow') self.emit(p.x, p.y, '120,255,160', 4, -50, 0, 0.25);
          if (type === 'blob') self.emit(p.x, p.y, '170,90,255', 7, 0, 0, 0.3, 200);
          if (this.t >= this.dur && !this.done) { this.done = true; onHit && onHit(p); }
          return !this.done;
        },
        draw(ctx) {
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
    update(dt) {
      this.t += dt;
      for (const a of this.actors.values()) {
        a.anim.update(dt);
        a.x += (a.tx - a.x) * Math.min(1, dt * 4);
        a.y += (a.ty - a.y) * Math.min(1, dt * 4);
        a.ox *= Math.pow(0.0005, dt); a.oy *= Math.pow(0.0005, dt);
        a.flash = Math.max(0, a.flash - dt * 2.5);
        a.spawn = Math.max(0, a.spawn - dt * 1.5);
      }
      const e = this.enemy;
      if (e) {
        e.st.t += dt;
        if (e.atkT >= 0) { e.atkT += dt / (e.atkDur || 1.2); e.st.atk = Math.min(1, e.atkT); if (e.atkT >= 1) { e.atkT = -1; e.st.atk = 0; } }
        e.hitT = Math.max(0, e.hitT - dt * 3);
        e.ox *= Math.pow(0.002, dt);
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
      this.shake *= Math.pow(0.02, dt);
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
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
      ctx.translate(sx, sy);
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
      if (this.enemy && this.enemyBarVisible) this.drawEnemyBar();
      if (this.banner) this.drawBanner();
      if (this.fade > 0.01) { ctx.fillStyle = `rgba(0,0,0,${this.fade})`; ctx.fillRect(0, 0, W, H); }
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
      // idle bernapas
      const breath = anim === 'idle' && !a.ko ? Math.sin(this.t * 2.2 + a.x) * 0.012 : 0;
      ctx.save();
      ctx.translate(a.x + a.ox, a.y + a.oy);
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
      if (e.dying >= 0) { alpha *= 1 - ease((e.dying - 0.4) / 0.6); sink = ease(e.dying) * 40; }
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
      ctx.scale(sc, sc);
      ctx.globalAlpha = alpha;
      let filter = 'none';
      if (e.hitT > 0.6) filter = 'brightness(3)';
      else if (e.hitT > 0) filter = `brightness(${1 + e.hitT}) saturate(${1 + e.hitT})`;
      if (e.dying >= 0) filter = `brightness(${1 + Math.abs(Math.sin(e.dying * 30)) * 1.5}) saturate(0.6)`;
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
      ctx.fillText(`STAGE ${this.stage}/4${this.stage === 4 ? ` • FASE ${e.phase}` : ''}`, x + w, y + 6);
      ctx.textAlign = 'left';
      const by = y + 40;
      ctx.fillStyle = '#1b0f22'; roundRect(ctx, x, by, w, h, 8); ctx.fill();
      const bar = clamp((e.barHp == null ? e.shownHp : e.barHp) / e.hpMax);
      const ghost = clamp(e.ghostHp == null ? bar : e.ghostHp);
      e.ghostHp = ghost + (bar - ghost) * 0.04;
      ctx.fillStyle = '#fbbf24'; roundRect(ctx, x, by, w * ghost, h, 8); ctx.fill();
      const g = ctx.createLinearGradient(0, by, 0, by + h);
      g.addColorStop(0, '#f87171'); g.addColorStop(1, '#b91c1c');
      ctx.fillStyle = g; roundRect(ctx, x, by, w * bar, h, 8); ctx.fill();
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
      a.anim.set('attack', false, () => a.anim.set('idle', true));
      if (ch.id === 'ksatria' || ch.id === 'paladin' || ch.id === 'assassin') a.ox = 0;
      const lunge = ch.id === 'ksatria' || ch.id === 'paladin';
      if (lunge) this.tween(350, (k) => { a.ox = Math.sin(k * Math.PI) * 70; });
      const impactDelay = (Math.min(ch.impact, (sheet ? Sprites.frameCount(sheet, 'attack') : 6) - 1) / fps) * 1000;
      await this.wait(impactDelay);
      const from = this.actorMuzzle(a);
      const head = this.enemyHead();
      const to = { x: head.x + rand(-60, 40), y: head.y + rand(-90, 90) };
      const type = ch.projectile;
      ({ slash: Sfx.slash, fireball: Sfx.fire, holy: Sfx.holy, arrow: Sfx.arrow, dagger: Sfx.slash, shockwave: Sfx.slash })[type]();
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const colors = { slash: '255,210,90', fireball: '255,140,40', holy: '255,240,170', arrow: '120,255,160', dagger: '190,120,255', shockwave: '120,190,255' };
      return new Promise((res) => {
        this.projectile(type, from, to, dist / 1700, () => {
          this.hitEnemy(r.damage, { color: colors[type], hpDrop: r.damage * scaleHp });
          res();
        });
      });
    }

    async ultimate(a, r, scaleHp) {
      const ch = a.char;
      const sheet = Sprites.get(a.charId);
      Sfx.ultimate();
      this.dimTarget = 0.72;
      a.hidden = true;
      const anim = new Sprites.Animator(ch.id, ch.fps);
      anim.set('ultimate', false);
      const rgb = hexToRgb(ch.color);
      this.spot = { charId: ch.id, anim, x: 560, y: 960, h: 420, t: performance.now(), colorRgba: `rgba(${rgb},0.9)` };
      this.showBanner(`⚡ ULTIMATE — ${a.name} ⚡`, ch.ultimateName, ch.color, 2600);
      const n = sheet ? Sprites.frameCount(sheet, 'ultimate') : 4;
      const animMs = Math.min(1500, Math.max(1000, (n / ch.fps.ultimate) * 1000));
      for (let i = 0; i < 8; i++) this.burst(560, 760, rgb, 6, 300, 8, { grav: -50 });
      await this.wait(animMs + 150);
      await this.ultimateFx(ch.ultimateFx, r, scaleHp, ch);
      this.spot = null;
      this.dimTarget = 0;
      a.hidden = false;
      a.anim.set('idle', true);
    }

    async ultimateFx(kind, r, scaleHp, ch) {
      const head = this.enemyHead();
      const e = this.enemy;
      const self = this;
      const hit = (color) => {
        this.hitEnemy(r.damage, { big: true, color, hpDrop: r.damage * scaleHp });
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
      e.atkT = 0; e.atkDur = 1.2;
      Sfx.enemyAttack();
      await this.wait(560);
      const key = e.key === 'demonking' ? 'demonking' + e.phase : e.key;
      const head = this.enemyHead();
      const proms = targets.map((t, i) => new Promise((res) => {
        const a = this.actors.get(t.id);
        if (!a) return res();
        const doHit = () => {
          a.flash = 1;
          if (t.hit > 0) {
            a.anim.set('hit', false, () => { a.anim.set('idle', true); res(); });
            this.addText(a.x, a.y - a.h - 10, `-${t.hit}`, '#f87171', 44);
            this.burst(a.x, a.y - a.h * 0.5, '255,90,90', 10, 300, 6);
            a.hp = t.hp;
            Sfx.hurt();
            if (t.koNow) setTimeout(() => { a.ko = true; }, 600);
          } else res();
          this.shake = Math.max(this.shake, 8);
        };
        const to = { x: a.x, y: a.y - a.h * 0.55 };
        setTimeout(() => {
          if (key === 'slime') this.projectile('blob', { x: head.x - 80, y: head.y }, to, 0.6, doHit);
          else if (key === 'skeleton') this.projectile('boneSlash', { x: head.x - 120, y: head.y }, to, 0.45, doHit);
          else if (key === 'general') this.projectile('orb', { x: head.x - 150, y: head.y + 40 }, to, 0.5, doHit);
          else if (key === 'demonking1') { this.bolt(a.x, a.y, '200,120,255'); setTimeout(doHit, 120); } else { this.skyFire(a, doHit); }
        }, i * Math.min(90, 900 / targets.length));
      }));
      if (payload.shield) {
        this.addText(640, 470, 'Perisai Rune! Serangan ½', '#93c5fd', 42, { dur: 1.8 });
      }
      await Promise.all(proms);
      await this.wait(250);
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
      this.setEnemy(next, { entrance: true });
      this.scroll = 0;
      this.fadeTarget = 0;
      await this.wait(500);
      await this.enemyEntrance();
    }

    async bossPhase2(next) {
      const e = this.enemy;
      this.showBanner('', 'Raja Iblis tumbang…?', '#f87171', 1600);
      await this.wait(1800);
      // kebangkitan
      Sfx.roar();
      this.dimTarget = 0.5;
      for (let i = 0; i < 6; i++) {
        this.bolt(e.x + rand(-300, 300), e.y, '255,60,40');
        this.shake = 26;
        this.flash = 0.35; this.flashColor = '255,40,30';
        await this.wait(260);
      }
      this.setEnemy(next, { entrance: false });
      this.phase = 2;
      const ne = this.enemy;
      ne.scale = 0.4; ne.alpha = 0;
      Sfx.boom();
      await this.tween(1300, (k) => { ne.scale = 0.4 + 0.6 * easeOut(k); ne.alpha = k; this.shake = 18 * (1 - k) + 4; });
      this.flash = 0.9; this.flashColor = '255,120,60';
      this.burst(ne.x, ne.y - 400, '255,120,40', 100, 1200, 14);
      this.dimTarget = 0;
      this.showBanner('FASE 2', 'RAJA IBLIS BANGKIT!', '#fb923c', 2600, 'Azaroth menunjukkan wujud sejatinya!');
      Sfx.roar();
      await this.wait(2200);
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
        this.addText(W / 2, 520, 'Tidak ada yang menjawab benar…', '#fca5a5', 52, { dur: 1.8, vy: -20 });
        await this.wait(900);
      } else {
        // serangan party
        const step = Math.min(110, 1400 / Math.max(1, normal.length));
        const proms = normal.map((r, i) => this.wait(i * step).then(() => this.attack(this.actors.get(r.id), r, scaleHp)));
        await Promise.all(proms);
        await this.wait(250);
        for (const r of featured) await this.ultimate(this.actors.get(r.id), r, scaleHp);
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
        await this.enemyDeath();
        if (payload.next) {
          if (payload.next.key === 'demonking' && payload.next.phase === 2) await this.bossPhase2(payload.next);
          else await this.transitionTo(payload.next);
          for (const a of this.actors.values()) { a.hp = 100; a.ko = false; }
        }
      }
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
