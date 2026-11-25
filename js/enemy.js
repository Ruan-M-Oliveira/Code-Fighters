(function (global) {
  'use strict';

  /*
   * Enemy stats. Health is in "damage units": a player bullet does 10.
   *   scout   = 2 hits, hunter = 5 hits, striker = 6 hits, swarm = 1 hit
   */
  var TYPES = {
    scout:   { health: 20, speed: 200, damage: 10, score: 100, radius: 13, color: '#ff9a3c', kamikaze: true,  start: 'approach' },
    hunter:  { health: 50, speed: 135, damage: 20, score: 250, radius: 19, color: '#ff3b4a', kamikaze: false, start: 'chase' },
    striker: { health: 60, speed: 115, damage: 15, score: 300, radius: 20, color: '#ffd24a', kamikaze: false, start: 'approach' },
    swarm:   { health: 10, speed: 150, damage: 8,  score: 40,  radius: 9,  color: '#ff5fa2', kamikaze: true,  start: 'orbit' }
  };

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Shortest signed angle from a to b
  function angleDiff(a, b) {
    var d = b - a;
    return Math.atan2(Math.sin(d), Math.cos(d));
  }

  function turnToward(current, target, maxStep) {
    var d = angleDiff(current, target);
    if (d > maxStep) d = maxStep;
    else if (d < -maxStep) d = -maxStep;
    return current + d;
  }

  /* ═════════════════════════════ Enemy ═════════════════════════════ */

  function Enemy(type, x, y, speedMult, healthMult, mgr) {
    var t = TYPES[type] || TYPES.scout;
    var diff = mgr.difficulty;

    this.type = type;
    this.mgr = mgr;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 90;
    this.angle = Math.PI / 2;
    this.radius = t.radius;
    this.color = t.color;
    this.explosionColor = t.color;

    this.maxHealth = t.health * (healthMult || 1) * diff.health;
    this.health = this.maxHealth;
    this.speed = t.speed * (speedMult || 1) * diff.speed;
    this.speedMult = speedMult || 1;
    this.damage = t.damage;
    this.scoreValue = t.score;
    this.dieOnContact = t.kamikaze;
    this.rammed = false;

    this.active = true;
    this.initialState = t.start;
    this.aiState = 'entering';
    this.targeting = false;      // true while aiming / locked on (used by ENGINE INSIGHT)
    this.dirX = 0;               // desired direction vector (for ENGINE INSIGHT)
    this.dirY = 1;

    this.age = 0;
    this.flash = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.heading = Math.PI / 2;  // scout steering angle
    this.stateTimer = 0;
    this.fireTimer = rand(1.2, 2.4);
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1.5, 3);
  }

  Enemy.prototype.takeDamage = function (d) {
    if (!this.active) return;
    this.health -= d;
    this.flash = 0.1;
    if (this.health <= 0) {
      this.health = 0;
      this.active = false;
      if (this.mgr.onKill) this.mgr.onKill(this);
    }
  };

  Enemy.prototype.update = function (dt, p) {
    if (!this.active) return;
    this.age += dt;
    if (this.flash > 0) this.flash -= dt;

    // Every enemy first flies into the arena from above
    if (this.aiState === 'entering') {
      this.vx *= 0.9;
      this.vy = Math.max(130, this.speed * 0.8);
      this.angle = Math.PI / 2;
      this.heading = Math.PI / 2;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= this.radius + 28) {
        this.aiState = this.initialState;
        this.stateTimer = this.type === 'swarm' ? rand(2.5, 5.5) : 0;
      }
      return;
    }

    switch (this.type) {
      case 'scout':   this._scout(dt, p); break;
      case 'hunter':  this._hunter(dt, p); break;
      case 'striker': this._striker(dt, p); break;
      case 'swarm':   this._swarm(dt, p); break;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  };

  /* ── SCOUT: weaves toward the player, then dashes in a straight line ── */
  Enemy.prototype._scout = function (dt, p) {
    var dx = p.x - this.x, dy = p.y - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var toPlayer = Math.atan2(dy, dx);
    this.dirX = dx / dist;
    this.dirY = dy / dist;
    var spd = this.speed;

    if (this.aiState === 'approach') {
      this.targeting = false;
      // sine-wave weave makes the approach hard to line up
      var desired = toPlayer + Math.sin(this.age * 4 + this.phase) * 0.55;
      this.heading = turnToward(this.heading, desired, 2.6 * dt);
      if (dist < 230) {
        this.aiState = 'dash';
        this.stateTimer = 0.7;
        this.heading = toPlayer;           // lock the dash direction
      }
    } else if (this.aiState === 'dash') {
      this.targeting = true;
      spd *= 1.75;
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) { this.aiState = 'recover'; this.stateTimer = 0.8; }
    } else { // recover
      this.targeting = false;
      spd *= 0.7;
      this.heading = turnToward(this.heading, toPlayer, 3.2 * dt);
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.aiState = 'approach';
    }
    this.vx = Math.cos(this.heading) * spd;
    this.vy = Math.sin(this.heading) * spd;
    this.angle = this.heading;
  };

  /* ── HUNTER: vector pursuit with steering force + separation ── */
  Enemy.prototype._hunter = function (dt, p) {
    // aim slightly ahead of where the player is going (lead pursuit)
    var dx = (p.x + p.vx * 0.3) - this.x;
    var dy = (p.y + p.vy * 0.3) - this.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    this.dirX = dx / d;
    this.dirY = dy / d;
    this.targeting = true;

    var desX = this.dirX * this.speed;
    var desY = this.dirY * this.speed;

    // separation: do not stack on other hunters
    var list = this.mgr.enemies;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === this || !o.active || o.type !== 'hunter') continue;
      var sx = this.x - o.x, sy = this.y - o.y;
      var sd = Math.sqrt(sx * sx + sy * sy);
      if (sd > 0 && sd < 60) {
        var push = (1 - sd / 60) * this.speed * 1.1;
        desX += (sx / sd) * push;
        desY += (sy / sd) * push;
      }
    }

    // steering = desired velocity - current velocity, limited by max acceleration
    var ax = desX - this.vx, ay = desY - this.vy;
    var al = Math.sqrt(ax * ax + ay * ay);
    var maxA = 340 * dt;
    if (al > maxA) { ax *= maxA / al; ay *= maxA / al; }
    this.vx += ax;
    this.vy += ay;
    this.angle = Math.atan2(this.vy, this.vx);
  };

  /* ── STRIKER: kites at range, repositions, fires telegraphed shots ── */
  Enemy.prototype._striker = function (dt, p) {
    var dx = p.x - this.x, dy = p.y - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / dist, uy = dy / dist;   // unit vector toward player
    this.dirX = ux;
    this.dirY = uy;
    this.angle = Math.atan2(dy, dx);

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir = -this.strafeDir;
      this.strafeTimer = rand(1.8, 3.4);
    }

    var desX = 0, desY = 0;
    this.fireTimer -= dt;
    this.targeting = false;

    if (this.fireTimer < 0.45) {
      // telegraph: slow down and lock on before shooting
      this.aiState = 'attack';
      this.targeting = true;
      desX = -uy * this.strafeDir * this.speed * 0.25;
      desY = ux * this.strafeDir * this.speed * 0.25;
      if (this.fireTimer <= 0) {
        this._shoot(p);
        this.fireTimer = rand(1.7, 2.6) / Math.min(1.5, this.speedMult);
      }
    } else if (dist < 240) {
      this.aiState = 'retreat';
      desX = -ux * this.speed * 1.15;
      desY = -uy * this.speed * 1.15;
    } else if (dist > 420) {
      this.aiState = 'approach';
      desX = ux * this.speed;
      desY = uy * this.speed;
    } else {
      this.aiState = 'strafe';
      desX = -uy * this.strafeDir * this.speed * 0.85;
      desY = ux * this.strafeDir * this.speed * 0.85;
    }

    // keep inside the arena; if cornered, flip strafe direction
    var W = this.mgr.canvasWidth, H = this.mgr.canvasHeight, m = 40;
    if ((this.x < m && desX < 0) || (this.x > W - m && desX > 0)) { desX = -desX * 0.5; this.strafeDir = -this.strafeDir; }
    if ((this.y < m && desY < 0) || (this.y > H - m && desY > 0)) { desY = -desY * 0.5; }

    var k = Math.min(1, dt * 3.2);
    this.vx += (desX - this.vx) * k;
    this.vy += (desY - this.vy) * k;
  };

  Enemy.prototype._shoot = function (p) {
    var mgr = this.mgr;
    if (!mgr.projectiles) return;
    var base = Math.atan2((p.y + p.vy * 0.25) - this.y, (p.x + p.vx * 0.25) - this.x);
    var shots = this.speedMult >= 1.2 ? [-0.14, 0.14] : [0];
    for (var i = 0; i < shots.length; i++) {
      var a = base + shots[i] + (Math.random() - 0.5) * 0.1;
      var sp = 330;
      mgr.projectiles.add(new global.Projectile(
        this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius,
        Math.cos(a) * sp, Math.sin(a) * sp,
        { type: 'enemy', damage: 12, size: 8, lifetime: 4, color: '#ff6a00' }
      ));
    }
    if (mgr.audio) mgr.audio.play('enemyShoot');
  };

  /* ── SWARM: group orbits the player in formation, then dives ── */
  Enemy.prototype._swarm = function (dt, p) {
    this.stateTimer -= dt;
    this.targeting = false;

    if (this.aiState === 'orbit') {
      // Every member shares mgr.time, each with its own phase offset => rotating ring
      var a = this.phase + this.mgr.time * 1.7;
      var R = 150 + Math.sin(this.mgr.time * 0.9 + this.phase) * 35;
      var tx = p.x + Math.cos(a) * R, ty = p.y + Math.sin(a) * R;
      var dx = tx - this.x, dy = ty - this.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      this.dirX = dx / d;
      this.dirY = dy / d;
      var s = Math.min(this.speed, d * 3.5);
      var k = Math.min(1, dt * 4);
      this.vx += (this.dirX * s - this.vx) * k;
      this.vy += (this.dirY * s - this.vy) * k;
      if (this.stateTimer <= 0) {
        var ang = Math.atan2(p.y - this.y, p.x - this.x);
        this.aiState = 'dive';
        this.stateTimer = 1.6;
        this.targeting = true;
        this.vx = Math.cos(ang) * this.speed * 1.6;
        this.vy = Math.sin(ang) * this.speed * 1.6;
      }
    } else { // dive: committed straight line
      this.targeting = true;
      var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
      this.dirX = this.vx / sp;
      this.dirY = this.vy / sp;
      if (this.stateTimer <= 0) {
        this.aiState = 'orbit';
        this.stateTimer = rand(2.5, 5);
      }
    }
    this.angle = Math.atan2(this.vy, this.vx);
  };

  /* ───────────────────────── drawing ───────────────────────── */

  Enemy.prototype.draw = function (ctx) {
    if (!this.active) return;
    var r = this.radius;
    var flashing = this.flash > 0;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fillStyle = flashing ? '#ffffff' : '#1a1224';
    ctx.strokeStyle = flashing ? '#ffffff' : this.color;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';

    if (this.type === 'scout') {
      // engine glow behind the dart
      ctx.fillStyle = 'rgba(255,150,60,0.55)';
      ctx.beginPath();
      ctx.arc(-r * 0.7, 0, r * (0.35 + Math.random() * 0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flashing ? '#ffffff' : '#1f1420';
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r * 0.9, r * 0.75);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r * 0.9, -r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (this.aiState === 'dash') {
        ctx.strokeStyle = 'rgba(255,200,120,0.6)';
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(-r * 3, 0);
        ctx.stroke();
      }
    } else if (this.type === 'hunter') {
      ctx.beginPath();
      ctx.moveTo(r * 1.1, 0);
      ctx.lineTo(r * 0.2, r * 0.95);
      ctx.lineTo(-r * 0.95, r * 0.55);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(-r * 0.95, -r * 0.55);
      ctx.lineTo(r * 0.2, -r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // twin prongs
      ctx.beginPath();
      ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 1.6, r * 0.35);
      ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 1.6, -r * 0.35);
      ctx.stroke();
      // pulsing eye
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(255,60,70,' + (0.6 + 0.4 * Math.sin(this.age * 8)) + ')';
      ctx.beginPath();
      ctx.arc(r * 0.2, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'striker') {
      ctx.beginPath();
      ctx.moveTo(r * 0.9, 0);
      ctx.lineTo(r * 0.1, r * 0.55);
      ctx.lineTo(-r * 0.2, r * 1.15);
      ctx.lineTo(-r * 0.85, r * 0.8);
      ctx.lineTo(-r * 0.55, 0);
      ctx.lineTo(-r * 0.85, -r * 0.8);
      ctx.lineTo(-r * 0.2, -r * 1.15);
      ctx.lineTo(r * 0.1, -r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // cannon
      ctx.fillStyle = flashing ? '#ffffff' : '#3a2c12';
      ctx.fillRect(r * 0.3, -3, r * 1.0, 6);
      ctx.strokeRect(r * 0.3, -3, r * 1.0, 6);
      // charge flare while locking on
      if (this.targeting) {
        var charge = Math.max(0, 1 - this.fireTimer / 0.45);
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'rgba(255,200,80,' + (0.4 + 0.6 * charge) + ')';
        ctx.beginPath();
        ctx.arc(r * 1.35, 0, 2 + charge * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else { // swarm
      ctx.beginPath();
      ctx.moveTo(r * 1.25, 0);
      ctx.lineTo(0, r * 0.85);
      ctx.lineTo(-r, 0);
      ctx.lineTo(0, -r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.aiState === 'dive' ? '#ffffff' : this.color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // small health bar for the tougher ships once damaged
    if ((this.type === 'hunter' || this.type === 'striker') && this.health < this.maxHealth) {
      var w = r * 2, ratio = this.health / this.maxHealth;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(this.x - r, this.y - r - 10, w, 3);
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x - r, this.y - r - 10, w * ratio, 3);
    }
  };

  /* ═════════════════════════════ EnemyManager ═════════════════════════════ */

  function EnemyManager() {
    this.enemies = [];
    this.canvasWidth = 800;
    this.canvasHeight = 600;
    this.projectiles = null;       // ProjectileManager, set by Game
    this.audio = null;
    this.onKill = null;            // callback(enemy) when an enemy is destroyed
    this.difficulty = { health: 1, speed: 1 };
    this.time = 0;                 // shared clock (swarm formations)
    this._swarmIndex = 0;
  }

  EnemyManager.prototype.spawnEnemy = function (type, x, y, speedMult, healthMult) {
    var e = new Enemy(type, x, y, speedMult, healthMult, this);
    if (type === 'swarm') e.phase = (this._swarmIndex++) * 0.55;
    this.enemies.push(e);
    return e;
  };

  EnemyManager.prototype.update = function (dt, player) {
    this.time += dt;
    var list = this.enemies;
    for (var i = 0; i < list.length; i++) list[i].update(dt, player);
    // compact in place: drop destroyed enemies
    var w = 0;
    for (var r = 0; r < list.length; r++) {
      if (list[r].active) list[w++] = list[r];
    }
    list.length = w;
  };

  EnemyManager.prototype.draw = function (ctx) {
    for (var i = 0; i < this.enemies.length; i++) this.enemies[i].draw(ctx);
  };

  EnemyManager.prototype.getActiveCount = function () {
    var n = 0;
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].active) n++;
    return n;
  };

  EnemyManager.prototype.clear = function () {
    this.enemies.length = 0;
    this.time = 0;
    this._swarmIndex = 0;
  };

  global.Enemy = Enemy;
  global.EnemyManager = EnemyManager;
}(typeof window !== 'undefined' ? window : this));
