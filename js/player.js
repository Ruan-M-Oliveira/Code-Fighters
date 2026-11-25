(function (global) {
  'use strict';

  var BASE_SPEED = 340;      // px/s
  var BULLET_SPEED = 780;    // px/s
  var DURATIONS = { SHIELD: 8, RAPID_FIRE: 9, MULTI_SHOT: 10, SPEED_BOOST: 8 };
  var BASE_DAMAGE = 10;

  /* ───────────── permanent ship upgrades (collected from upgrade cores) ─────────────
   * Every step is deliberately small; the weapon tier (visuals) is what grows
   * the most. Totals at max: damage +24%, fire rate +25%, move +15%. */
  var UPGRADES = {
    DAMAGE:     { max: 4, weapon: true,  weight: 1.2, label: 'DANO',                   color: '#ff7a5c',
                  desc: function (l) { return '+' + (l * 6) + '% de dano por disparo'; } },
    FIRE_RATE:  { max: 4, weapon: true,  weight: 1.2, label: 'CADÊNCIA DE TIRO',       color: '#ffcc00',
                  desc: function (l) { return '+' + Math.round((1 / FIRE_MULT[l] - 1) * 100) + '% de disparos por segundo'; } },
    MULTI:      { max: 2, weapon: true,  weight: 0.9, label: 'TIRO MÚLTIPLO',          color: '#00eeff',
                  desc: function (l) { return l === 1 ? 'Canhões laterais auxiliares' : 'Leque de canhões laterais'; } },
    PROJ_SPEED: { max: 3, weapon: true,  weight: 0.8, label: 'VELOCIDADE DO PROJÉTIL', color: '#7fb2ff',
                  desc: function (l) { return '+' + (l * 10) + '% de velocidade dos disparos'; } },
    SHIELD:     { max: 3, weapon: false, weight: 0.9, label: 'BARREIRA DE ENERGIA',    color: '#4488ff',
                  desc: function (l) { return 'Absorve 1 impacto · recarga ' + BARRIER_RECHARGE[l] + ' s · escudo +' + (l * 1.5) + ' s'; } },
    MOVE:       { max: 3, weapon: false, weight: 0.7, label: 'PROPULSORES',            color: '#44ff88',
                  desc: function (l) { return '+' + (l * 5) + '% de velocidade de voo'; } },
    SPECIAL:    { max: 2, weapon: false, weight: 1.0, label: 'ONDA DE CHOQUE',         color: '#c58cff',
                  desc: function (l) { return l === 1 ? 'Ataque especial: tecla Q ou botão direito' : 'Mais dano, alcance e recarga de ' + SPECIAL_CD[l] + ' s'; } }
  };
  var UPGRADE_ORDER = ['DAMAGE', 'FIRE_RATE', 'MULTI', 'PROJ_SPEED', 'SHIELD', 'MOVE', 'SPECIAL'];
  var FIRE_MULT = [1, 0.93, 0.875, 0.83, 0.8];          // cooldown multiplier (diminishing)
  var BARRIER_RECHARGE = [0, 32, 26, 20];                // seconds
  var SPECIAL_CD = [0, 22, 16];
  var TIER_STEPS = [0, 2, 4, 7, 10];                     // weapon points needed for tiers 1..5

  /**
   * Player — the pilot's spacecraft.
   * Exposes the fields CollisionManager expects: x, y, radius, active,
   * invincibleTimer, takeDamage(), addScore(), incrementCombo(), applyPowerUp().
   */
  function Player(x, y) {
    this.ship = global.Ships.get(global.Ships.DEFAULT);
    this.reset(x, y);
  }

  /** Selects one of the four fighters (stats, weapon, visuals). */
  Player.prototype.setShip = function (id) {
    this.ship = global.Ships.get(id);
    this.radius = this.ship.radius;
    this.heat = 0;
    this._alt = false;
  };

  Player.prototype.reset = function (x, y) {
    this.x = x || 0;
    this.y = y || 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = this.ship ? this.ship.radius : 15;
    this.heat = 0;                   // Nova reactor heat (0..1)
    this._alt = false;               // alternating volley flag
    this.maxHealth = 100;
    this.health = 100;
    this.active = true;
    this.invincible = false;
    this.invincibleTimer = 0;
    this.invincibleDuration = 1.1;   // seconds of grace after a hit
    this.angle = -Math.PI / 2;
    this.cooldown = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.comboWindow = 2.6;          // seconds to chain the next kill
    this.multiplier = 1;
    this.hitFlash = 0;
    this.shieldFlash = 0;
    this.damageMult = 1;
    this._thrustT = 0;
    this.onDamage = null;
    this.onPowerUp = null;
    this.onUpgrade = null;
    this.onBarrier = null;
    this.onSpecial = null;
    this.onSpecialReady = null;

    this.up = { DAMAGE: 0, FIRE_RATE: 0, MULTI: 0, PROJ_SPEED: 0, SHIELD: 0, MOVE: 0, SPECIAL: 0 };
    this.weaponTier = 1;
    this.muzzle = 0;
    this.barrierReady = false;
    this.barrierT = 0;
    this.barrierFlash = 0;
    this.specialCD = 0;
    this.tierFlash = 0;
    global.PowerUpEffects.clear();
  };

  /* ───────────────────────── upgrades ───────────────────────── */

  Player.prototype.totalUpgrades = function () {
    var n = 0;
    for (var k in this.up) n += this.up[k];
    return n;
  };

  Player.prototype._calcTier = function () {
    var pts = this.up.DAMAGE + this.up.FIRE_RATE + this.up.MULTI + this.up.PROJ_SPEED;
    var t = 1;
    for (var i = 1; i < TIER_STEPS.length; i++) if (pts >= TIER_STEPS[i]) t = i + 1;
    return t;
  };

  /** Picks a random upgrade that is not maxed yet (weighted). Returns its key or null. */
  Player.prototype.rollUpgrade = function () {
    var total = 0, i, k, opts = [];
    for (i = 0; i < UPGRADE_ORDER.length; i++) {
      k = UPGRADE_ORDER[i];
      if (this.up[k] < UPGRADES[k].max) { opts.push(k); total += UPGRADES[k].weight; }
    }
    if (!opts.length) return null;
    var r = Math.random() * total;
    for (i = 0; i < opts.length; i++) {
      r -= UPGRADES[opts[i]].weight;
      if (r <= 0) return opts[i];
    }
    return opts[opts.length - 1];
  };

  Player.prototype.applyUpgrade = function (key) {
    var oldTier = this.weaponTier;
    if (!key) {
      // everything maxed: convert the core into hull repair
      this.health = Math.min(this.maxHealth, this.health + 20);
      if (this.onUpgrade) this.onUpgrade(null, 0, 0, false);
      return;
    }
    this.up[key] = Math.min(UPGRADES[key].max, this.up[key] + 1);
    if (key === 'SHIELD' && this.up.SHIELD === 1) { this.barrierReady = true; this.barrierT = 0; }
    if (key === 'SPECIAL' && this.up.SPECIAL === 1) this.specialCD = 0;
    this.weaponTier = this._calcTier();
    var tierUp = this.weaponTier > oldTier;
    if (tierUp) this.tierFlash = 1.2;
    if (this.onUpgrade) this.onUpgrade(key, this.up[key], UPGRADES[key].max, tierUp);
  };

  Player.prototype.specialCooldown = function () { return SPECIAL_CD[this.up.SPECIAL] || 0; };
  Player.prototype.barrierRecharge = function () { return BARRIER_RECHARGE[this.up.SHIELD] || 0; };

  Player.prototype.isShielded = function () {
    return global.PowerUpEffects.isActive('SHIELD');
  };

  /* ───────────────────────── scoring / combo ───────────────────────── */

  Player.prototype.addScore = function (v) {
    this.score += Math.round(v * this.multiplier);
  };

  Player.prototype.incrementCombo = function () {
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.comboTimer = this.comboWindow;
    // +0.5x every 4 kills in a row, capped at x5
    this.multiplier = Math.min(5, 1 + Math.floor(this.combo / 4) * 0.5);
  };

  /* ───────────────────────── damage / power-ups ───────────────────────── */

  Player.prototype.takeDamage = function (d) {
    if (!this.active) return;
    if (this.isShielded()) {
      this.shieldFlash = 0.35;
      return;
    }
    // regenerating energy barrier (SHIELD upgrade) soaks one full hit
    if (this.barrierReady) {
      this.barrierReady = false;
      this.barrierT = this.barrierRecharge();
      this.barrierFlash = 0.5;
      this.shieldFlash = 0.35;
      if (this.onBarrier) this.onBarrier();
      return;
    }
    this.health -= d * this.damageMult;
    this.hitFlash = 0.25;
    if (this.health <= 0) {
      this.health = 0;
      this.active = false;
    }
    if (this.onDamage) this.onDamage(d);
  };

  Player.prototype.applyPowerUp = function (type) {
    if (type === 'UPGRADE') {
      this.applyUpgrade(this.rollUpgrade());
      return;
    }
    if (type === 'REPAIR') {
      this.health = Math.min(this.maxHealth, this.health + 35);
    } else {
      var dur = DURATIONS[type] || 8;
      if (type === 'SHIELD') dur += this.up.SHIELD * 1.5;
      global.PowerUpEffects.apply(type, dur);
    }
    if (this.onPowerUp) this.onPowerUp(type);
  };

  /* ───────────────────────── update ───────────────────────── */

  Player.prototype.update = function (dt, input, game) {
    var W = game.width, H = game.height;
    var FX = global.PowerUpEffects;

    // --- movement input (keyboard or touch) ---
    var ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (input.touch.active) {
      var tx = input.touch.x - this.x;
      var ty = (input.touch.y - 80) - this.y;
      var td = Math.sqrt(tx * tx + ty * ty);
      if (td > 6) {
        var f = Math.min(1, td / 70);
        ix = (tx / td) * f;
        iy = (ty / td) * f;
      }
    } else if (ix !== 0 || iy !== 0) {
      // Normalise so diagonals are not faster than straight lines
      var len = Math.sqrt(ix * ix + iy * iy);
      ix /= len;
      iy /= len;
    }
    // controle: o analógico esquerdo dá movimento proporcional (0..1)
    var pad = input.pad;
    if (pad && (pad.move.x || pad.move.y)) { ix = pad.move.x; iy = pad.move.y; }

    var sh = this.ship;
    var speed = BASE_SPEED * sh.move.speed * (1 + this.up.MOVE * 0.05) * (FX.isActive('SPEED_BOOST') ? 1.5 : 1);
    // smooth acceleration (ship maneuverability); knockback impulses decay with it
    var k = Math.min(1, dt * sh.move.accel);
    this.vx += (ix * speed - this.vx) * k;
    this.vy += (iy * speed - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    var m = this.radius + 4;
    if (this.x < m) { this.x = m; this.vx = 0; }
    if (this.x > W - m) { this.x = W - m; this.vx = 0; }
    if (this.y < m) { this.y = m; this.vy = 0; }
    if (this.y > H - m) { this.y = H - m; this.vy = 0; }

    // --- aiming ---
    if (input.touch.active) this.angle = -Math.PI / 2;
    else this.angle = Math.atan2(input.mouse.y - this.y, input.mouse.x - this.x);

    // --- timers ---
    if (this.invincibleTimer > 0) this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.shieldFlash > 0) this.shieldFlash -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.combo = 0; this.multiplier = 1; }
    }

    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.tierFlash > 0) this.tierFlash -= dt;
    if (this.barrierFlash > 0) this.barrierFlash -= dt;
    if (this.up.SHIELD > 0 && !this.barrierReady) {
      this.barrierT -= dt;
      if (this.barrierT <= 0) { this.barrierReady = true; this.barrierFlash = 0.4; }
    }

    // --- special weapon ---
    if (this.up.SPECIAL > 0) {
      if (this.specialCD > 0) {
        this.specialCD -= dt;
        if (this.specialCD <= 0 && this.onSpecialReady) this.onSpecialReady();
      }
      if ((input.special || (pad && pad.special)) && this.specialCD <= 0) {
        this.specialCD = this.specialCooldown();
        if (this.onSpecial) this.onSpecial(this.up.SPECIAL);
      }
    }

    // --- shooting (cadence comes from the ship, upgrades scale it) ---
    var W8 = sh.weapon;
    var firing = input.fire || input.touch.active || !!(pad && pad.fire);
    if (W8.spinUp) {
      // Nova: the reactor heats up while the trigger is held
      this.heat = firing ? Math.min(1, this.heat + dt / W8.spinUp.time) : Math.max(0, this.heat - dt * 1.8);
    }
    this.cooldown -= dt;
    if (firing && this.cooldown <= 0) {
      this.fire(game);
      var base = W8.spinUp ? W8.spinUp.from + (W8.interval - W8.spinUp.from) * this.heat : W8.interval;
      var iv = base * FIRE_MULT[this.up.FIRE_RATE] * (FX.isActive('RAPID_FIRE') ? 0.44 : 1);
      this.cooldown = Math.max(W8.minInterval, iv);
    }

    this.emitThrust(dt, game.particles);
  };

  Player.prototype.emitThrust = function (dt, particles) {
    this._thrustT -= dt;
    if (this._thrustT > 0) return;
    this._thrustT = 0.03;
    // exhaust from one engine per tick (round-robin over the ship's engines)
    var eng = this.ship.hull.engines;
    this._eng = ((this._eng || 0) + 1) % eng.length;
    var e = eng[this._eng];
    var ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    var back = this.angle + Math.PI;
    particles.emitThrust(
      this.x + ca * (e.x - 1) - sa * e.y, this.y + sa * (e.x - 1) + ca * e.y,
      back, global.PowerUpEffects.isActive('SPEED_BOOST') ? '#66ffaa' : this.ship.hull.exhaust, 110
    );
  };

  Player.prototype.fire = function (game) {
    var sh = this.ship, W8 = sh.weapon;
    var tier = this.weaponTier;
    var pal = sh.palette[tier];
    var dmg = W8.damage * (1 + this.up.DAMAGE * 0.06);
    var speed = W8.speed * (1 + this.up.PROJ_SPEED * 0.1);
    this._alt = !this._alt;
    var shots = global.Ships.volley(sh, this.up, {
      multiShot: global.PowerUpEffects.isActive('MULTI_SHOT'), alt: this._alt
    });
    var ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      var a = this.angle + s.a;
      var p = game.projectiles.spawn(
        this.x + ca * s.x - sa * s.y, this.y + sa * s.x + ca * s.y,
        Math.cos(a) * speed, Math.sin(a) * speed, {
          damage: dmg * s.f, type: 'player', color: pal.color, pal: pal,
          shape: W8.shape, heavy: !!W8.heavy,
          size: W8.size, lifetime: 1.5, tier: tier, primary: s.primary
        });
      // forgiving hit-circle so fast bullets do not tunnel through small enemies
      p.radius = W8.heavy ? 9 : 6;
    }
    this.muzzle = 0.05 + tier * 0.012 + (W8.heavy ? 0.05 : 0);
    var m0 = W8.pattern[0];
    game.particles.emitMuzzle(this.x + ca * (m0.x + 2), this.y + sa * (m0.x + 2), this.angle,
      Math.min(5, tier + (W8.heavy ? 1 : 0)), pal.color);
    game.audio.play('shoot', tier, W8.sfx);
  };

  /* ───────────────────────── drawing ───────────────────────── */

  Player.prototype.draw = function (ctx, time) {
    if (!this.active) return;
    var blink = this.invincibleTimer > 0 && Math.floor(this.invincibleTimer * 14) % 2 === 0;
    var moving = Math.min(1, Math.sqrt(this.vx * this.vx + this.vy * this.vy) / BASE_SPEED);
    var t = (time !== undefined ? time : performance.now() / 1000);

    var tier = this.weaponTier || 1;
    var tcol = this.ship.palette[tier].color;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.globalAlpha = blink ? 0.4 : 1;
    global.Ships.draw(ctx, this.ship, t, {
      tier: tier, multi: this.up ? this.up.MULTI : 0, moving: moving,
      hitFlash: this.hitFlash, tierFlash: this.tierFlash, charge: this.heat,
      muzzle: this.muzzle > 0 ? Math.min(1, this.muzzle / (0.05 + tier * 0.012)) : 0
    });
    ctx.restore();

    // tier 5: soft energy aura around the whole ship
    if (tier >= 5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 4);
      var ag = ctx.createRadialGradient(this.x, this.y, 8, this.x, this.y, 36);
      ag.addColorStop(0, tcol);
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(this.x, this.y, 36, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // regenerating barrier (SHIELD upgrade): thin rotating hex while charged
    if (this.up && this.up.SHIELD > 0 && (this.barrierReady || this.barrierFlash > 0) && !this.isShielded()) {
      var br = this.radius + 9;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(t * 0.8);
      ctx.globalAlpha = this.barrierReady ? 0.32 + 0.12 * Math.sin(t * 3) + this.barrierFlash : this.barrierFlash * 1.6;
      ctx.strokeStyle = this.barrierReady ? '#66b8ff' : '#ffffff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (var hx = 0; hx < 6; hx++) {
        var ha = hx * Math.PI / 3;
        if (hx === 0) ctx.moveTo(Math.cos(ha) * br, Math.sin(ha) * br);
        else ctx.lineTo(Math.cos(ha) * br, Math.sin(ha) * br);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // shield bubble
    if (this.isShielded()) {
      var left = global.PowerUpEffects.getRemainingTime('SHIELD');
      var fade = left < 2 ? (0.5 + 0.5 * Math.sin(t * 18)) : 1;
      var r = this.radius + 11 + Math.sin(t * 5) * 1.2;
      ctx.save();
      ctx.globalAlpha = fade;
      var sg = ctx.createRadialGradient(this.x, this.y, r * 0.55, this.x, this.y, r);
      sg.addColorStop(0, 'rgba(68,170,255,0)');
      sg.addColorStop(1, 'rgba(68,170,255,' + (0.28 + Math.min(0.5, this.shieldFlash * 1.6)) + ')');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,200,255,' + (0.7 + this.shieldFlash) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  };

  global.Player = Player;
  // base values the ship-select cards show (single source of truth)
  global.PLAYER_BASE = { speed: BASE_SPEED, health: 100 };
  global.SHIP_UPGRADES = UPGRADES;
  global.SHIP_UPGRADE_ORDER = UPGRADE_ORDER;
}(typeof window !== 'undefined' ? window : this));
