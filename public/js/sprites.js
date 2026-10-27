// Pemuat & penggambar atlas sprite karakter (hasil tools/slice_sprites.py).
// Setiap frame: [sx, sy, w, h, anchorX, anchorY, adaGlow]
(function () {
  const BASE = '/assets/characters/';
  const cache = {};

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function load(id) {
    if (cache[id]) return cache[id];
    cache[id] = (async () => {
      const [meta, img, glow] = await Promise.all([
        fetch(BASE + id + '.json').then((r) => r.json()),
        loadImage(BASE + id + '.webp'),
        loadImage(BASE + id + '_glow.webp'),
      ]);
      const sheet = { id, meta, img, glow };
      cache[id] = sheet;
      return sheet;
    })();
    return cache[id];
  }

  function get(id) {
    const s = cache[id];
    return s && !(s instanceof Promise) ? s : null;
  }

  function frameCount(sheet, anim) {
    const a = sheet && sheet.meta.anims[anim];
    return a ? a.length : 0;
  }

  // Gambar frame dengan kaki (anchor) di (x, y). height = tinggi tampil badan.
  function draw(ctx, sheet, anim, index, x, y, height, opt = {}) {
    if (!sheet || !sheet.img) return;
    const frames = sheet.meta.anims[anim] || sheet.meta.anims.idle;
    const f = frames[Math.max(0, Math.min(frames.length - 1, index | 0))];
    drawRec(ctx, sheet, f, x, y, height / sheet.meta.bodyH, opt);
  }

  function drawFx(ctx, sheet, name, x, y, scale, opt = {}) {
    const f = sheet && sheet.meta.fx[name];
    if (f) drawRec(ctx, sheet, f, x, y, scale, opt);
  }

  function drawRec(ctx, sheet, f, x, y, s, opt) {
    const [sx, sy, w, h, ax, ay, hasGlow] = f;
    const alpha = opt.alpha == null ? 1 : opt.alpha;
    if (alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    if (opt.rotate) ctx.rotate(opt.rotate);
    if (opt.flip) ctx.scale(-1, 1);
    ctx.globalAlpha = alpha;
    if (opt.filter) ctx.filter = opt.filter;
    const dx = -ax * s, dy = -ay * s;
    ctx.drawImage(sheet.img, sx, sy, w, h, dx, dy, w * s, h * s);
    ctx.filter = 'none';
    if (hasGlow && sheet.glow && opt.glow !== false) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (opt.glowAlpha == null ? 1 : opt.glowAlpha);
      ctx.drawImage(sheet.glow, sx, sy, w, h, dx, dy, w * s, h * s);
      if (opt.glowBoost) {
        ctx.globalAlpha = alpha * opt.glowBoost;
        ctx.drawImage(sheet.glow, sx, sy, w, h, dx, dy, w * s, h * s);
      }
    }
    ctx.restore();
  }

  // Animator sederhana untuk satu aktor
  class Animator {
    constructor(charId, fpsTable) {
      this.charId = charId;
      this.fps = fpsTable || {};
      this.set('idle', true);
    }
    set(anim, loop = false, onEnd = null, fps = null) {
      this.anim = anim;
      this.loop = loop;
      this.t = 0;
      this.onEnd = onEnd;
      this.customFps = fps;
      this.ended = false;
    }
    update(dt) {
      this.t += dt;
      const sheet = get(this.charId);
      if (!sheet || this.loop || this.ended) return;
      const n = frameCount(sheet, this.anim);
      const fps = this.customFps || this.fps[this.anim] || 10;
      if (this.t * fps >= n) {
        this.ended = true;
        const cb = this.onEnd; this.onEnd = null;
        if (cb) cb();
      }
    }
    frame() {
      const sheet = get(this.charId);
      if (!sheet) return 0;
      const n = frameCount(sheet, this.anim) || 1;
      const fps = this.customFps || this.fps[this.anim] || 10;
      const i = Math.floor(this.t * fps);
      return this.loop ? i % n : Math.min(n - 1, i);
    }
  }

  window.Sprites = { load, get, draw, drawFx, frameCount, Animator };
})();
