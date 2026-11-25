(function (global) {
  'use strict';

  var PHASE_COLORS = { 1: '#b84dff', 2: '#ff4dc8', 3: '#ff3a3a' };

  function rand(a, b) { return a + Math.random() * (b - a); }

  /**
   * Boss — "ENCOURAÇADO ÔMEGA" (Omega Dreadnought).
   *   Phase 1 (100-66% HP): aimed fan + twin wing cannons, slow sweep.
   *   Phase 2 ( 66-33% HP): adds a rotating double spiral, figure-eight movement.
   *   Phase 3 ( <33%  HP): adds radial ring bursts, summons a swarm and
   *                        performs a telegraphed CHARGE at the player.
   * CollisionManager drives damage through takeDamage() and, on death,
   * sets defeated=true / active=false; the boss then plays a death sequence.
   */
  function Boss(w, h, mgr) {
    this.mgr = mgr;
    this.type = 'boss';
    this.name = 'ENCOURAÇADO ÔMEGA';
    this.x = w / 2;
    this.y = -150;
    this.targetY = Math.max(130, h * 0.2);
    this.cx = w / 2;
    this.vx = 0;
    this.vy = 0;
    this.radius = 76;
    this.maxHealth = 1500 * mgr.difficulty.health;
    this.health = this.maxHealth;
    this.damage = 25;               // contact damage
    this.scoreValue = 10000;
    this.explosionColor = '#ff00ff';
    this.hitColor = '#ff66ff';
    this.projectiles = [];          // unused: boss bullets live in the shared ProjectileManager

    this.phase = 1;
    this.active = true;
    this.entering = true;
    this.defeated = false;          // set by CollisionManager
    this.dying = false;
    this.finished = false;
    this.aiState = 'entering';
    this.targeting = false;

    this.t = 0;
    this.hitFlash = 0;
    this.phaseFlash = 0;
    this.fanTimer = 1.5;
    this.sideTimer = 0.8;
    this.spiralTimer = 0;
    this.spiralAngle = 0;
    this.ringTimer = 2.2;
    this.ringOffset = 0;

    this.chargeState = 'idle';      // idle | telegraph | charge | return
    this.chargeTimer = rand(5, 7);
    this.chargeT = 0;
    this.lockX = 0;
    this.lockY = 0;
    this.chargeDX = 0;
    this.chargeDY = 1;
    this.deathT = 0;
    this.explT = 0;
  }

  /* ───────────────────────── damage / phases ───────────────────────── */

  Boss.prototype.takeDamage = function (d) {
    if (!this.active || this.entering || this.defeated) return;
    this.health = Math.max(0, this.health - d);
    this.hitFlash = 0.08;
    var ratio = this.health / this.maxHealth;
    var np = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (np !== this.phase && this.health > 0) {
      this.phase = np;
      this.phaseFlash = 1.2;
      this.fanTimer = 1.2;
      this.ringTimer = 1.6;
      if (np === 3) this._summonMinions();
      if (this.mgr.onPhase) this.mgr.onPhase(np);
    }
  };

  Boss.prototype._summonMinions = function () {
    var em = this.mgr.enemies;
    if (!em) return;
    for (var i = 0; i < 6; i++) {
      em.spawnEnemy('swarm', this.x + (i - 2.5) * 36, this.y + 20, 1.2, 0.6);
    }
  };

  /* ───────────────────────── shooting helpers ───────────────────────── */

  Boss.prototype._shoot = function (x, y, angle, speed, size) {
    var pm = this.mgr.projectiles;
    if (!pm) return;
    pm.add(new global.Projectile(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
      { type: 'boss', damage: 12, size: size || 10, lifetime: 6, color: '#cc00ff' }));
  };

  Boss.prototype._fan = function (p) {
    var base = Math.atan2(p.y - this.y, p.x - this.x);
    for (var i = -2; i <= 2; i++) {
      this._shoot(this.x, this.y + 40, base + i * 0.26, 290, 10);
    }
    if (this.mgr.audio) this.mgr.audio.play('enemyShoot');
  };

  Boss.prototype._ring = function (n) {
    this.ringOffset += 0.2;
    for (var i = 0; i < n; i++) {
      this._shoot(this.x, this.y, this.ringOffset + (i / n) * Math.PI * 2, 230, 9);
    }
    if (this.mgr.audio) this.mgr.audio.play('enemyShoot');
  };

  /* ───────────────────────── update ───────────────────────── */

  Boss.prototype.update = function (dt, p) {
    if (dt <= 0) return;
    if (this.defeated && !this.dying) this._beginDeath();
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.phaseFlash > 0) this.phaseFlash -= dt;
    if (this.dying) { this._updateDeath(dt); return; }

    this.t += dt;
    var ox = this.x, oy = this.y;

    // Entrance: slide in from the top, invulnerable
    if (this.entering) {
      this.y += 90 * dt;
      this.vx = 0;
      this.vy = 90;
      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.entering = false;
        this.aiState = 'fan';
      }
      return;
    }

    this.cx = this.mgr.canvasWidth / 2;
    if (this.chargeState === 'idle') this._move(dt);
    else this._chargeUpdate(dt, p);

    // Attack patterns (suspended during the charge sequence)
    if (this.chargeState === 'idle') {
      this.aiState = this.phase === 1 ? 'fan' : this.phase === 2 ? 'spiral' : 'enrage';
      this.targeting = false;

      this.fanTimer -= dt;
      if (this.fanTimer <= 0) {
        this._fan(p);
        this.fanTimer = this.phase === 1 ? 1.5 : this.phase === 2 ? 1.7 : 1.9;
      }
      this.sideTimer -= dt;
      if (this.sideTimer <= 0) {
        this._shoot(this.x - 70, this.y + 30, Math.PI / 2, 300, 8);
        this._shoot(this.x + 70, this.y + 30, Math.PI / 2, 300, 8);
        this.sideTimer = 0.9;
      }
      if (this.phase >= 2) {
        this.spiralTimer -= dt;
        if (this.spiralTimer <= 0) {
          this.spiralAngle += 0.55;
          this._shoot(this.x, this.y, this.spiralAngle, 220, 8);
          this._shoot(this.x, this.y, this.spiralAngle + Math.PI, 220, 8);
          this.spiralTimer = this.phase === 2 ? 0.12 : 0.2;
        }
      }
      if (this.phase === 3) {
        this.ringTimer -= dt;
        if (this.ringTimer <= 0) { this._ring(22); this.ringTimer = 2.4; }
        this.chargeTimer -= dt;
        if (this.chargeTimer <= 0) this._startTelegraph(p);
      }
    }

    this.vx = (this.x - ox) / dt;
    this.vy = (this.y - oy) / dt;
  };

  Boss.prototype._move = function (dt) {
    var amp = Math.min(this.mgr.canvasWidth * 0.3, 340);
    var tx, ty, t = this.t;
    if (this.phase === 1) {
      tx = this.cx + Math.sin(t * 0.55) * amp;
      ty = this.targetY + Math.sin(t * 1.1) * 8;
    } else if (this.phase === 2) {
      tx = this.cx + Math.sin(t * 0.85) * amp;            // figure-eight
      ty = this.targetY + Math.sin(t * 1.7) * 38;
    } else {
      tx = this.cx + Math.sin(t * 1.1) * amp;
      ty = this.targetY + Math.sin(t * 2.2) * 30;
    }
    var k = Math.min(1, dt * 3);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  };

  /* ── charge attack: telegraph (aim line) -> rush -> return ── */

  Boss.prototype._startTelegraph = function (p) {
    this.chargeState = 'telegraph';
    this.chargeT = 1.0;
    this.lockX = p.x;
    this.lockY = p.y;
    this.aiState = 'telegraph';
    this.targeting = true;
  };

  Boss.prototype._chargeUpdate = function (dt, p) {
    var W = this.mgr.canvasWidth, H = this.mgr.canvasHeight;
    if (this.chargeState === 'telegraph') {
      this.chargeT -= dt;
      if (this.chargeT > 0.25) { this.lockX = p.x; this.lockY = p.y; } // last 0.25s: target is locked
      if (this.chargeT <= 0) {
        var dx = this.lockX - this.x, dy = this.lockY - this.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        this.chargeDX = dx / d;
        this.chargeDY = dy / d;
        this.chargeState = 'charge';
        this.chargeT = 0.75;
        this.aiState = 'charge';
      }
    } else if (this.chargeState === 'charge') {
      this.x += this.chargeDX * 720 * dt;
      this.y += this.chargeDY * 720 * dt;
      this.x = Math.max(this.radius, Math.min(W - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(H - this.radius, this.y));
      this.chargeT -= dt;
      if (this.chargeT <= 0) { this.chargeState = 'return'; this.aiState = 'return'; this.targeting = false; }
    } else { // return
      var k = Math.min(1, dt * 2.4);
      this.x += (this.cx - this.x) * k;
      this.y += (this.targetY - this.y) * k;
      var rx = this.cx - this.x, ry = this.targetY - this.y;
      if (rx * rx + ry * ry < 900) {
        this.chargeState = 'idle';
        this.chargeTimer = rand(6, 8);
      }
    }
  };

  /* ── death sequence ── */

  Boss.prototype._beginDeath = function () {
    this.dying = true;
    this.deathT = 2.6;
    this.explT = 0;
    this.vx = 0;
    this.vy = 0;
    this.targeting = false;
    this.aiState = 'dying';
    if (this.mgr.onDying) this.mgr.onDying(this);
  };

  Boss.prototype._updateDeath = function (dt) {
    this.deathT -= dt;
    this.explT -= dt;
    this.y += 14 * dt;
    var m = this.mgr;
    if (this.explT <= 0 && m.particles) {
      this.explT = 0.11;
      var colors = ['#ff00ff', '#ff6600', '#ffcc33', '#ffffff'];
      m.particles.emitExplosion(
        this.x + rand(-85, 85), this.y + rand(-55, 55),
        { count: 14, color: colors[Math.floor(Math.random() * colors.length)], size: rand(10, 24) }
      );
      if (m.audio) m.audio.play('enemyExplode');
      if (m.onShake) m.onShake(7);
    }
    if (this.deathT <= 0) {
      this.finished = true;
      if (m.particles) {
        m.particles.emitExplosion(this.x, this.y, { count: 100, color: '#ff6600', size: 90 });
        m.particles.emitExplosion(this.x, this.y, { count: 60, color: '#ff00ff', size: 55 });
      }
      if (m.audio) m.audio.play('bossExplode');
      if (m.onShake) m.onShake(22);
      if (m.onDefeated) m.onDefeated(this);
    }
  };

  /* ───────────────────────── drawing ───────────────────────── */

  function hullPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 78);
    ctx.lineTo(46, 46); ctx.lineTo(104, 14); ctx.lineTo(142, -14);
    ctx.lineTo(110, -42); ctx.lineTo(66, -54); ctx.lineTo(34, -70);
    ctx.lineTo(-34, -70); ctx.lineTo(-66, -54); ctx.lineTo(-110, -42);
    ctx.lineTo(-142, -14); ctx.lineTo(-104, 14); ctx.lineTo(-46, 46);
    ctx.closePath();
  }

  Boss.prototype.draw = function (ctx) {
    if (this.finished) return;
    var col = PHASE_COLORS[this.phase];

    // charge telegraph: warning line to the locked target
    if (this.chargeState === 'telegraph') {
      var a = 0.35 + 0.35 * Math.sin(this.t * 30);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,60,60,' + a + ')';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.lockX, this.lockY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.dying) {
      ctx.translate(rand(-3, 3), rand(-3, 3));
      ctx.globalAlpha = 0.65 + 0.35 * Math.random();
    } else if (this.entering) {
      ctx.globalAlpha = 0.75;
    }
    ctx.scale(0.82, 0.82);

    // engine glow (back of the ship)
    var fl = 14 + Math.sin(this.t * 25) * 3;
    for (var e = -1; e <= 1; e++) {
      var eg = ctx.createRadialGradient(e * 58, -64, 0, e * 58, -64, fl + 10);
      eg.addColorStop(0, 'rgba(255,255,255,0.9)');
      eg.addColorStop(0.4, col);
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha *= 0.85;
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(e * 58, -64, fl + 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.85;
    }

    // hull
    ctx.shadowBlur = 26;
    ctx.shadowColor = col;
    var hg = ctx.createLinearGradient(0, -70, 0, 78);
    hg.addColorStop(0, '#120d22');
    hg.addColorStop(1, '#2b1f4e');
    ctx.fillStyle = hg;
    hullPath(ctx);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // armour plate
    ctx.fillStyle = '#1a1330';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 54); ctx.lineTo(30, 32); ctx.lineTo(72, 8); ctx.lineTo(94, -10);
    ctx.lineTo(70, -30); ctx.lineTo(40, -42); ctx.lineTo(-40, -42); ctx.lineTo(-70, -30);
    ctx.lineTo(-94, -10); ctx.lineTo(-72, 8); ctx.lineTo(-30, 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // wing cannons
    ctx.fillStyle = '#0e0a1c';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.fillRect(-92, 4, 16, 38); ctx.strokeRect(-92, 4, 16, 38);
    ctx.fillRect(76, 4, 16, 38); ctx.strokeRect(76, 4, 16, 38);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(-84, 44, 4, 0, Math.PI * 2); ctx.arc(84, 44, 4, 0, Math.PI * 2); ctx.fill();

    // pulsing core (faster in later phases)
    var pulse = 1 + 0.14 * Math.sin(this.t * (3 + this.phase * 2.5));
    var cg = ctx.createRadialGradient(0, 8, 0, 0, 8, 30 * pulse);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.3, col);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 8, 30 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // flashes
    if (this.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.7, this.hitFlash * 8) + ')';
      hullPath(ctx);
      ctx.fill();
    }
    if (this.phaseFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, this.phaseFlash * 0.7) + ')';
      hullPath(ctx);
      ctx.fill();
    }
    if (this.chargeState === 'telegraph') {
      ctx.fillStyle = 'rgba(255,40,40,' + (0.2 + 0.2 * Math.sin(this.t * 30)) + ')';
      hullPath(ctx);
      ctx.fill();
    }
    ctx.restore();
  };

  /* ═════════════════════════════ BossManager ═════════════════════════════ */

  function BossManager() {
    this.boss = null;
    this.projectiles = null;   // shared ProjectileManager
    this.enemies = null;       // EnemyManager (for minions)
    this.particles = null;
    this.audio = null;
    this.canvasWidth = 800;
    this.canvasHeight = 600;
    this.difficulty = { health: 1, speed: 1 };
    this.onPhase = null;
    this.onDying = null;
    this.onDefeated = null;
    this.onShake = null;
  }

  BossManager.prototype.spawnBoss = function (w, h) {
    this.canvasWidth = w || this.canvasWidth;
    this.canvasHeight = h || this.canvasHeight;
    this.boss = new Boss(this.canvasWidth, this.canvasHeight, this);
    return this.boss;
  };

  // WaveManager asks this to know when the boss wave is over
  BossManager.prototype.isAlive = function () {
    return !!this.boss && !this.boss.finished;
  };

  BossManager.prototype.update = function (dt, player) {
    if (this.boss && !this.boss.finished) this.boss.update(dt, player);
  };

  BossManager.prototype.draw = function (ctx) {
    if (this.boss && !this.boss.finished) this.boss.draw(ctx);
  };

  BossManager.prototype.reset = function () {
    this.boss = null;
  };

  global.Boss = Boss;
  global.BossManager = BossManager;
}(typeof window !== 'undefined' ? window : this));
