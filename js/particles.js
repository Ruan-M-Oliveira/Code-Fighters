(function (global) {
  'use strict';

  var KIND_SPARK = 0, KIND_RING = 1, KIND_SMOKE = 2, KIND_FLASH = 3;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /**
   * ParticleSystem — a pooled particle engine.
   * Dead particles go back into a pool instead of being garbage-collected,
   * so explosions do not cause allocation spikes in the main loop.
   */
  function ParticleSystem(max) {
    this.particles = [];   // live particles (also read by ENGINE INSIGHT)
    this._pool = [];       // recycled particle objects
    this.max = max || 900;
  }

  ParticleSystem.prototype._add = function (kind, x, y, vx, vy, life, size, color, drag) {
    if (this.particles.length >= this.max) return null;
    var p = this._pool.pop() || {};
    p.kind = kind;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.size = size; p.color = color; p.drag = drag || 0;
    this.particles.push(p);
    return p;
  };

  /** Generic burst. opts: count, color, size, spread */
  ParticleSystem.prototype.emit = function (x, y, opts) {
    opts = opts || {};
    var n = Math.min(opts.count || 8, 60);
    var spread = opts.spread || 2;
    var size = opts.size || 3;
    var color = opts.color || '#ffffff';
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (0.35 + Math.random() * 0.65) * spread * 90;
      this._add(KIND_SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.25, 0.65), clamp(size * rand(0.15, 0.4), 1, 4.5), color, 2.2);
    }
  };

  /** Big explosion: flash + shockwave rings + sparks + smoke. opts: count, color, size */
  ParticleSystem.prototype.emitExplosion = function (x, y, opts) {
    opts = opts || {};
    var count = Math.min(opts.count || 20, 120);
    var size = opts.size || 12;
    var color = opts.color || '#ff7800';

    this._add(KIND_FLASH, x, y, 0, 0, 0.14, size * 1.5, '#ffffff', 0);
    this._add(KIND_RING, x, y, 0, 0, 0.5, size * 3.2, color, 0);
    this._add(KIND_RING, x, y, 0, 0, 0.32, size * 1.9, '#ffffff', 0);

    var palette = [color, '#ffffff', '#ffcc66', color];
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = rand(40, 130 + size * 5);
      this._add(KIND_SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.4, 1.0), rand(1.2, 3.6), palette[i & 3], 1.6);
    }
    var smoke = Math.floor(count / 4);
    for (var j = 0; j < smoke; j++) {
      var b = Math.random() * Math.PI * 2;
      var s2 = rand(10, 55);
      this._add(KIND_SMOKE, x, y, Math.cos(b) * s2, Math.sin(b) * s2,
        rand(0.8, 1.4), rand(size * 0.5, size * 1.1), '#8a94ad', 1.2);
    }
  };

  /** Pickup effect: expanding ring + sparks. opts: count, color, size, spread */
  ParticleSystem.prototype.emitCollect = function (x, y, opts) {
    opts = opts || {};
    var color = opts.color || '#00ffff';
    this._add(KIND_RING, x, y, 0, 0, 0.45, 46, color, 0);
    this.emit(x, y, { count: opts.count || 16, color: color, size: 5, spread: opts.spread || 2.6 });
  };

  /** Engine exhaust. angle = direction the exhaust travels. */
  ParticleSystem.prototype.emitThrust = function (x, y, angle, color, speed) {
    var a = angle + (Math.random() - 0.5) * 0.35;
    var sp = (speed || 90) * rand(0.6, 1.1);
    this._add(KIND_SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
      rand(0.18, 0.34), rand(1.2, 2.4), color || '#00d8ff', 2.5);
  };

  /* ── weapon effects (decorative: skipped when the pool is getting full) ── */

  ParticleSystem.prototype._busy = function () {
    return this.particles.length > this.max * 0.7;
  };

  /** Bullet impact: sparks thrown back toward the shooter, scaled by weapon tier. */
  ParticleSystem.prototype.emitImpact = function (x, y, angle, tier, color) {
    tier = tier || 1;
    var busy = this._busy();
    var n = busy ? 2 : 2 + tier;
    var back = angle + Math.PI;
    for (var i = 0; i < n; i++) {
      var a = back + (Math.random() - 0.5) * (1.6 + tier * 0.15);
      var sp = rand(90, 170 + tier * 35);
      this._add(KIND_SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.14, 0.26 + tier * 0.04), rand(1, 1.6 + tier * 0.3), i & 1 ? '#ffffff' : color, 3.2);
    }
    if (busy) return;
    if (tier >= 2) this._add(KIND_RING, x, y, 0, 0, 0.16 + tier * 0.03, 7 + tier * 3.5, color, 0);
    if (tier >= 3) this._add(KIND_FLASH, x, y, 0, 0, 0.07 + tier * 0.012, 3 + tier * 1.4, '#ffffff', 0);
    if (tier >= 5) this._add(KIND_RING, x, y, 0, 0, 0.3, 30, '#ffffff', 0);
  };

  /** Muzzle sparks in the firing direction (the flash itself is drawn by the ship). */
  ParticleSystem.prototype.emitMuzzle = function (x, y, angle, tier, color) {
    if (tier < 2 || this._busy()) return;
    var n = tier - 1;
    for (var i = 0; i < n; i++) {
      var a = angle + (Math.random() - 0.5) * 0.9;
      var sp = rand(120, 240);
      this._add(KIND_SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.08, 0.16), rand(0.9, 1.6), i & 1 ? '#ffffff' : color, 4);
    }
    if (tier >= 4) this._add(KIND_RING, x, y, 0, 0, 0.12, 9 + tier * 1.5, color, 0);
  };

  /** One trailing ember behind a high-tier bullet. */
  ParticleSystem.prototype.emitTrail = function (x, y, vx, vy, color, size) {
    if (this._busy()) return;
    this._add(KIND_SPARK, x, y, vx * 0.08 + rand(-25, 25), vy * 0.08 + rand(-25, 25),
      rand(0.14, 0.26), size || 1.4, color, 3);
  };

  /** Special weapon shockwave. */
  ParticleSystem.prototype.emitShockwave = function (x, y, radius, color) {
    this._add(KIND_FLASH, x, y, 0, 0, 0.2, 40, '#ffffff', 0);
    this._add(KIND_RING, x, y, 0, 0, 0.55, radius, color, 0);
    this._add(KIND_RING, x, y, 0, 0, 0.42, radius * 0.75, '#ffffff', 0);
    this._add(KIND_RING, x, y, 0, 0, 0.7, radius * 1.08, color, 0);
    for (var i = 0; i < 36; i++) {
      var a = (i / 36) * Math.PI * 2 + Math.random() * 0.1;
      var sp = rand(radius * 1.4, radius * 2.1);
      this._add(KIND_SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.35, 0.6), rand(1.4, 2.6), i & 1 ? '#ffffff' : color, 2.4);
    }
  };

  ParticleSystem.prototype.update = function (dt) {
    var list = this.particles;
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove + recycle
        list[i] = list[list.length - 1];
        list.pop();
        this._pool.push(p);
        continue;
      }
      if (p.drag) {
        var k = 1 / (1 + p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  };

  ParticleSystem.prototype.draw = function (ctx) {
    var list = this.particles;
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var a = p.life / p.maxLife; // 1 -> 0
      var t = 1 - a;
      if (p.kind === KIND_RING) {
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1 + 3 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - a * a), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === KIND_SMOKE) {
        ctx.globalAlpha = a * 0.16;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + t * 1.2), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === KIND_FLASH) {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.7 + t), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.6, p.size * (0.4 + 0.6 * a)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  ParticleSystem.prototype.clear = function () {
    for (var i = 0; i < this.particles.length; i++) this._pool.push(this.particles[i]);
    this.particles.length = 0;
  };

  global.ParticleSystem = ParticleSystem;
}(typeof window !== 'undefined' ? window : this));
