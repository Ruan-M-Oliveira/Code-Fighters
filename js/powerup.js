(function (global) {
  'use strict';

  // ─── Power-Up Type Constants ───────────────────────────────────────────────
  var PowerUpType = {
    SHIELD:      'SHIELD',
    RAPID_FIRE:  'RAPID_FIRE',
    MULTI_SHOT:  'MULTI_SHOT',
    SPEED_BOOST: 'SPEED_BOOST',
    REPAIR:      'REPAIR',
    UPGRADE:     'UPGRADE'
  };

  var POWERUP_LIFETIME  = 8;      // seconds before auto-despawn
  var POWERUP_RADIUS    = 18;     // collision radius
  var HOVER_AMPLITUDE   = 5;      // pixels up/down
  var HOVER_SPEED       = 2.2;    // radians per second
  var RING_SPEED        = 1.8;    // ring rotation speed
  var PULSE_SPEED       = 3.0;    // glow pulse speed

  // ─── Colour palette per type ───────────────────────────────────────────────
  var TYPE_META = {
    SHIELD:      { color: '#4488ff', glow: '#2266dd', label: 'SHIELD'  },
    RAPID_FIRE:  { color: '#ffcc00', glow: '#ff8800', label: 'RAPID'   },
    MULTI_SHOT:  { color: '#00eeff', glow: '#0088cc', label: 'MULTI'   },
    SPEED_BOOST: { color: '#44ff88', glow: '#008833', label: 'SPEED'   },
    REPAIR:      { color: '#ff4488', glow: '#cc0044', label: 'REPAIR'  },
    UPGRADE:     { color: '#ffe27a', glow: '#ff9a1f', label: 'UPGRADE' }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PowerUp
  // ═══════════════════════════════════════════════════════════════════════════
  function PowerUp(x, y, type) {
    this.x        = x;
    this.y        = y;
    this.type     = type || PowerUpType.SHIELD;
    this.radius   = POWERUP_RADIUS;
    this.lifetime = type === 'UPGRADE' ? 14 : POWERUP_LIFETIME;
    this._age     = 0;
    this._hover   = 0;
    this._ring    = 0;
    this._pulse   = 0;
    this._active  = true;
    this._meta    = TYPE_META[this.type] || TYPE_META.SHIELD;
  }

  Object.defineProperty(PowerUp.prototype, 'isActive', {
    get: function () { return this._active; }
  });

  // Aliases used by CollisionManager
  Object.defineProperty(PowerUp.prototype, 'active', {
    get: function () { return this._active; },
    set: function (v) { this._active = !!v; }
  });

  Object.defineProperty(PowerUp.prototype, 'color', {
    get: function () { return this._meta.color; }
  });

  PowerUp.prototype.collect = function () {
    this._active = false;
  };

  PowerUp.prototype.update = function (dt) {
    if (!this._active) return;

    this._age    += dt;
    this._hover  += dt * HOVER_SPEED;
    this._ring   += dt * RING_SPEED;
    this._pulse  += dt * PULSE_SPEED;

    if (this._age >= this.lifetime) {
      this._active = false;
    }
  };

  PowerUp.prototype.draw = function (ctx) {
    if (!this._active) return;
    if (this.type === PowerUpType.UPGRADE) { this._drawUpgrade(ctx); return; }

    var hoverY   = Math.sin(this._hover) * HOVER_AMPLITUDE;
    var cx       = this.x;
    var cy       = this.y + hoverY;
    var pulse    = 0.5 + 0.5 * Math.sin(this._pulse);           // 0..1
    var fadeRatio = Math.max(0, 1 - this._age / this.lifetime);
    var alpha    = Math.min(1, fadeRatio * 3);                   // fade out in last ~33 %
    var glowSize = this.radius * (1.4 + 0.3 * pulse);

    ctx.save();
    ctx.globalAlpha = alpha;

    // ── Outer glow ──────────────────────────────────────────────────────────
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize * 1.6);
    grad.addColorStop(0,   hexAlpha(this._meta.glow, 0.55 + 0.2 * pulse));
    grad.addColorStop(0.5, hexAlpha(this._meta.glow, 0.25));
    grad.addColorStop(1,   hexAlpha(this._meta.glow, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowSize * 1.6, 0, Math.TAU || Math.PI * 2);
    ctx.fill();

    // ── Rotating ring ───────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this._ring);

    var ringR = this.radius + 4;
    var dashCount = 8;
    var dashAngle = (Math.PI * 2) / dashCount;
    ctx.strokeStyle = hexAlpha(this._meta.color, 0.6 + 0.4 * pulse);
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';

    for (var d = 0; d < dashCount; d++) {
      var a0 = d * dashAngle;
      var a1 = a0 + dashAngle * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, ringR, a0, a1);
      ctx.stroke();
    }
    ctx.restore();

    // ── Core disc ───────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(cx, cy);
    var disc = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
    disc.addColorStop(0,   hexAlpha(this._meta.color, 0.95));
    disc.addColorStop(0.6, hexAlpha(this._meta.color, 0.75));
    disc.addColorStop(1,   hexAlpha(this._meta.glow,  0.5));
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // ── Type icon ───────────────────────────────────────────────────────────
    switch (this.type) {
      case PowerUpType.SHIELD:      drawShieldIcon(ctx,      this.radius); break;
      case PowerUpType.RAPID_FIRE:  drawRapidFireIcon(ctx,   this.radius); break;
      case PowerUpType.MULTI_SHOT:  drawMultiShotIcon(ctx,   this.radius); break;
      case PowerUpType.SPEED_BOOST: drawSpeedBoostIcon(ctx,  this.radius); break;
      case PowerUpType.REPAIR:      drawRepairIcon(ctx,      this.radius); break;
    }

    ctx.restore();
    ctx.restore();
  };

  // Upgrade core: hexagonal gold chip, clearly different from the round power-ups
  PowerUp.prototype._drawUpgrade = function (ctx) {
    var cx = this.x, cy = this.y + Math.sin(this._hover) * HOVER_AMPLITUDE;
    var pulse = 0.5 + 0.5 * Math.sin(this._pulse * 1.6);
    var left = this.lifetime - this._age;
    var alpha = left < 3 ? (0.45 + 0.55 * Math.abs(Math.sin(this._age * 9))) : 1;
    var r = this.radius + 2;
    var i, a;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);

    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
    g.addColorStop(0, hexAlpha('#ffb43a', 0.55 + 0.25 * pulse));
    g.addColorStop(0.5, hexAlpha('#ff8a1f', 0.18));
    g.addColorStop(1, hexAlpha('#ff8a1f', 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2); ctx.fill();

    // rotating outer hex frame
    ctx.save();
    ctx.rotate(this._ring * 0.6);
    ctx.strokeStyle = hexAlpha('#ffe27a', 0.7 + 0.3 * pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i < 6; i++) {
      a = i * Math.PI / 3;
      if (i === 0) ctx.moveTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6));
      else ctx.lineTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // core hex
    var cg = ctx.createLinearGradient(0, -r, 0, r);
    cg.addColorStop(0, '#fff6c8');
    cg.addColorStop(0.5, '#ffd24d');
    cg.addColorStop(1, '#d9821a');
    ctx.fillStyle = cg;
    ctx.beginPath();
    for (i = 0; i < 6; i++) {
      a = i * Math.PI / 3 + Math.PI / 6;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // up-arrow icon
    var s = r * 0.5;
    ctx.fillStyle = '#3a2200';
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.05);
    ctx.lineTo(s * 0.85, -s * 0.05);
    ctx.lineTo(s * 0.32, -s * 0.05);
    ctx.lineTo(s * 0.32, s * 0.95);
    ctx.lineTo(-s * 0.32, s * 0.95);
    ctx.lineTo(-s * 0.32, -s * 0.05);
    ctx.lineTo(-s * 0.85, -s * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // ─── Icon drawers (ctx already translated to centre) ──────────────────────

  function drawShieldIcon(ctx, r) {
    var s = r * 0.55;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    // Hexagon
    for (var i = 0; i < 6; i++) {
      var ang = (Math.PI / 3) * i - Math.PI / 6;
      var px  = Math.cos(ang) * s;
      var py  = Math.sin(ang) * s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    // Inner shield arc
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.1);
    ctx.lineTo(0,        -s * 0.6);
    ctx.lineTo(s * 0.5,  -s * 0.1);
    ctx.arcTo(s * 0.5, s * 0.6, 0, s * 0.75, s * 0.5);
    ctx.arcTo(-s * 0.5, s * 0.6, -s * 0.5, -s * 0.1, s * 0.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
    ctx.stroke();
  }

  function drawRapidFireIcon(ctx, r) {
    var s = r * 0.55;
    ctx.fillStyle   = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    // Lightning bolt
    ctx.beginPath();
    ctx.moveTo(s * 0.1,  -s);
    ctx.lineTo(-s * 0.4, s * 0.1);
    ctx.lineTo(0,        s * 0.1);
    ctx.lineTo(-s * 0.1, s);
    ctx.lineTo(s * 0.4,  -s * 0.1);
    ctx.lineTo(0,        -s * 0.1);
    ctx.closePath();
    ctx.fill();
  }

  function drawMultiShotIcon(ctx, r) {
    var s = r * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    // Three arrows pointing upward: left, centre, right
    var offsets = [[-s * 0.6, s * 0.1], [0, 0], [s * 0.6, s * 0.1]];
    for (var i = 0; i < offsets.length; i++) {
      var ox = offsets[i][0];
      var oy = offsets[i][1];
      ctx.beginPath();
      ctx.moveTo(ox,          oy + s * 0.5);
      ctx.lineTo(ox,          oy - s * 0.5);
      ctx.lineTo(ox - s*0.25, oy - s * 0.1);
      ctx.moveTo(ox,          oy - s * 0.5);
      ctx.lineTo(ox + s*0.25, oy - s * 0.1);
      ctx.stroke();
    }
  }

  function drawSpeedBoostIcon(ctx, r) {
    var s = r * 0.55;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    // Double chevron pointing up
    var rows = [[-s * 0.4, s * 0.3], [0, -s * 0.1]];
    for (var i = 0; i < rows.length; i++) {
      var base = rows[i][1];
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, base + s * 0.35);
      ctx.lineTo(0,          base);
      ctx.lineTo(s * 0.55,  base + s * 0.35);
      ctx.stroke();
    }
  }

  function drawRepairIcon(ctx, r) {
    var s  = r * 0.5;
    var hw = s * 0.3;
    ctx.fillStyle = '#ffffff';
    // Cross / plus
    ctx.fillRect(-hw, -s,  hw * 2, s * 2);
    ctx.fillRect(-s,  -hw, s * 2,  hw * 2);
  }

  // ─── Helper: hex colour + alpha ───────────────────────────────────────────
  function hexAlpha(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PowerUpManager
  // ═══════════════════════════════════════════════════════════════════════════
  function PowerUpManager() {
    this.powerups = [];
  }

  var ALL_TYPES = [
    PowerUpType.SHIELD,
    PowerUpType.RAPID_FIRE,
    PowerUpType.MULTI_SHOT,
    PowerUpType.SPEED_BOOST,
    PowerUpType.REPAIR
  ];

  PowerUpManager.prototype.spawn = function (x, y, type) {
    var pu = new PowerUp(x, y, type);
    this.powerups.push(pu);
    return pu;
  };

  PowerUpManager.prototype.spawnRandom = function (x, y) {
    var type = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
    return this.spawn(x, y, type);
  };

  PowerUpManager.prototype.update = function (dt) {
    for (var i = this.powerups.length - 1; i >= 0; i--) {
      this.powerups[i].update(dt);
      if (!this.powerups[i].isActive) {
        this.powerups.splice(i, 1);
      }
    }
  };

  PowerUpManager.prototype.draw = function (ctx) {
    for (var i = 0; i < this.powerups.length; i++) {
      this.powerups[i].draw(ctx);
    }
  };

  PowerUpManager.prototype.clear = function () {
    this.powerups.length = 0;
  };

  Object.defineProperty(PowerUpManager.prototype, 'active', {
    get: function () {
      return this.powerups.filter(function (p) { return p.isActive; });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PowerUpEffects
  // ═══════════════════════════════════════════════════════════════════════════
  var PowerUpEffects = (function () {
    var _effects = {};

    return {
      apply: function (type, duration) {
        _effects[type] = {
          remaining: duration,
          total:     duration
        };
      },

      update: function (dt) {
        var keys = Object.keys(_effects);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          _effects[k].remaining -= dt;
          if (_effects[k].remaining <= 0) {
            delete _effects[k];
          }
        }
      },

      isActive: function (type) {
        return !!(_effects[type] && _effects[type].remaining > 0);
      },

      getRemainingTime: function (type) {
        if (_effects[type]) return Math.max(0, _effects[type].remaining);
        return 0;
      },

      getProgress: function (type) {
        if (!_effects[type]) return 0;
        return Math.max(0, _effects[type].remaining / _effects[type].total);
      },

      clear: function () {
        _effects = {};
      },

      getAll: function () {
        return Object.assign({}, _effects);
      }
    };
  }());

  // ═══════════════════════════════════════════════════════════════════════════
  // Exports
  // ═══════════════════════════════════════════════════════════════════════════
  global.PowerUpType    = PowerUpType;
  global.PowerUp        = PowerUp;
  global.PowerUpManager = PowerUpManager;
  global.PowerUpEffects = PowerUpEffects;

}(typeof window !== 'undefined' ? window : this));
