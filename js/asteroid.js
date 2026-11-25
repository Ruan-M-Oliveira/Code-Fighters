(function (global) {
  'use strict';

  var SIZES = {
    large:  { health: 3, radius: 55, score: 50,  speed: 40, damage: 25 },
    medium: { health: 2, radius: 30, score: 100, speed: 65, damage: 15 },
    small:  { health: 1, radius: 15, score: 150, speed: 95, damage: 10 }
  };

  var VERTEX_MIN = 8;
  var VERTEX_MAX = 12;
  var HIT_FLASH_DURATION = 0.12;

  function randBetween(a, b) {
    return a + Math.random() * (b - a);
  }

  function randInt(a, b) {
    return Math.floor(randBetween(a, b + 1));
  }

  function buildShape(vertexCount, radius) {
    var pts = [];
    for (var i = 0; i < vertexCount; i++) {
      var angle = (i / vertexCount) * Math.PI * 2;
      var r = radius * randBetween(0.68, 1.0);
      pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return pts;
  }

  /* ─────────────────────────── Asteroid ─────────────────────────── */

  function Asteroid(x, y, size, vx, vy) {
    var cfg = SIZES[size];

    this.x        = x;
    this.y        = y;
    this.size     = size;
    this.radius   = cfg.radius * randBetween(0.88, 1.12);
    this.maxHealth = cfg.health;
    this.health   = cfg.health;
    this.scoreValue = cfg.score;
    this.isActive = true;
    this.damage = cfg.damage;
    this._fragmented = false;
    this.manager = null;
    this.explosionColor = '#aab4c8';

    this.rotation  = randBetween(0, Math.PI * 2);
    this.rotSpeed  = randBetween(0.3, 1.1) * (Math.random() < 0.5 ? 1 : -1);

    var spd = cfg.speed;
    if (vx !== undefined && vy !== undefined) {
      this.vx = vx;
      this.vy = vy;
    } else {
      var ang = randBetween(0, Math.PI * 2);
      this.vx = Math.cos(ang) * randBetween(spd * 0.5, spd);
      this.vy = Math.sin(ang) * randBetween(spd * 0.5, spd);
    }

    this.vertexCount = randInt(VERTEX_MIN, VERTEX_MAX);
    this.shape       = buildShape(this.vertexCount, this.radius);

    this.lastHitTime = -999;

    var r1 = randInt(80,  105);
    var g1 = randInt(85,  110);
    var b1 = randInt(100, 128);
    this._colorOuter = 'rgb(' + r1 + ',' + g1 + ',' + b1 + ')';

    var r2 = randInt(50, 75);
    var g2 = randInt(52, 78);
    var b2 = randInt(65, 95);
    this._colorInner = 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
  }

  Asteroid.prototype.update = function (dt, canvasWidth, canvasHeight) {
    if (!this.isActive) return;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotSpeed * dt;

    var margin = this.radius + 10;

    if (canvasWidth && canvasHeight) {
      if (this.x < -margin)             this.x = canvasWidth  + margin;
      else if (this.x > canvasWidth  + margin) this.x = -margin;
      if (this.y < -margin)             this.y = canvasHeight + margin;
      else if (this.y > canvasHeight + margin) this.y = -margin;
    }
  };

  Asteroid.prototype.draw = function (ctx) {
    if (!this.isActive) return;

    var now      = performance.now() / 1000;
    var timeSince = now - this.lastHitTime;
    var flashing  = timeSince < HIT_FLASH_DURATION;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.beginPath();
    var pts = this.shape;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();

    if (flashing) {
      var alpha = 1 - timeSince / HIT_FLASH_DURATION;
      ctx.fillStyle = 'rgba(255,220,180,' + (alpha * 0.75) + ')';
      ctx.fill();
    } else {
      var grad = ctx.createRadialGradient(
        -this.radius * 0.25, -this.radius * 0.25, this.radius * 0.08,
         this.radius * 0.1,   this.radius * 0.1,  this.radius * 1.15
      );
      grad.addColorStop(0,   this._colorInner);
      grad.addColorStop(1,   this._colorOuter);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(40,45,60,0.65)';
    ctx.lineWidth   = this.size === 'large' ? 2 : 1.5;
    ctx.stroke();

    ctx.beginPath();
    for (var j = 0; j < 3; j++) {
      var px = this.shape[j * 2 % pts.length].x;
      var py = this.shape[j * 2 % pts.length].y;
      var nx = this.shape[(j * 2 + 1) % pts.length].x;
      var ny = this.shape[(j * 2 + 1) % pts.length].y;
      ctx.moveTo(px * 0.6, py * 0.6);
      ctx.lineTo(nx * 0.5, ny * 0.5);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    var hpRatio = this.health / this.maxHealth;
    if (hpRatio < 1) {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio);
      ctx.strokeStyle = hpRatio > 0.5
        ? 'rgba(100,220,100,0.5)'
        : hpRatio > 0.25
          ? 'rgba(255,200,50,0.5)'
          : 'rgba(255,80,60,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  };

  Asteroid.prototype.hit = function (damage) {
    if (!this.isActive) return false;
    this.health -= (damage || 1);
    this.lastHitTime = performance.now() / 1000;
    if (this.health <= 0) {
      this.isActive = false;
      return true;
    }
    return false;
  };

  Asteroid.prototype.getFragments = function () {
    var frags = [];
    var nextSize = null;
    if (this.size === 'large')  nextSize = 'medium';
    if (this.size === 'medium') nextSize = 'small';
    if (!nextSize) return frags;

    var count = randInt(2, 3);
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2 + randBetween(-0.3, 0.3);
      var spd   = SIZES[nextSize].speed * randBetween(0.6, 1.1);
      var nvx   = Math.cos(angle) * spd;
      var nvy   = Math.sin(angle) * spd;
      frags.push(new Asteroid(this.x, this.y, nextSize, nvx, nvy));
    }
    return frags;
  };

  /* ─────────────────────────── AsteroidManager ─────────────────────── */

  // ---- API expected by CollisionManager: .active, takeDamage(), fragment() ----
  Object.defineProperty(Asteroid.prototype, 'active', {
    get: function () { return this.isActive; },
    set: function (v) { this.isActive = !!v; }
  });

  // Projectile damage is expressed in "hit points x10"; asteroids use small HP.
  Asteroid.prototype.takeDamage = function (d) {
    return this.hit(Math.max(1, Math.round((d || 10) / 10)));
  };

  Asteroid.prototype.fragment = function () {
    if (this._fragmented) return;
    this._fragmented = true;
    if (this.manager) {
      this.manager.addFragments(this);
      if (typeof this.manager.onDestroyed === 'function') this.manager.onDestroyed(this);
    }
  };

  AsteroidManager.prototype.spawnAsteroid = function (x, y, size, speed) {
    var ang = randBetween(0, Math.PI * 2);
    var spd = speed || SIZES[size].speed;
    return this.spawn(x, y, size, Math.cos(ang) * spd, Math.sin(ang) * spd);
  };

  AsteroidManager.prototype.getActiveCount = function () {
    var n = 0;
    for (var i = 0; i < this.asteroids.length; i++) {
      if (this.asteroids[i].isActive) n++;
    }
    return n;
  };

  function AsteroidManager() {
    this.asteroids = [];
    this.onDestroyed = null;
  }

  Object.defineProperty(AsteroidManager.prototype, 'active', {
    get: function () {
      return this.asteroids.filter(function (a) { return a.isActive; });
    }
  });

  AsteroidManager.prototype.spawn = function (x, y, size, vx, vy) {
    var ast = new Asteroid(x, y, size, vx, vy);
    ast.manager = this;
    this.asteroids.push(ast);
    return ast;
  };

  AsteroidManager.prototype.spawnRandom = function (canvasWidth, canvasHeight) {
    var side = randInt(0, 3);
    var x, y;
    var margin = 60;

    if (side === 0) {
      x = randBetween(0, canvasWidth);
      y = -margin;
    } else if (side === 1) {
      x = canvasWidth + margin;
      y = randBetween(0, canvasHeight);
    } else if (side === 2) {
      x = randBetween(0, canvasWidth);
      y = canvasHeight + margin;
    } else {
      x = -margin;
      y = randBetween(0, canvasHeight);
    }

    var sizes   = ['large', 'medium', 'small'];
    var weights = [0.5, 0.3, 0.2];
    var roll    = Math.random();
    var chosen  = 'large';
    var cumul   = 0;
    for (var i = 0; i < sizes.length; i++) {
      cumul += weights[i];
      if (roll < cumul) { chosen = sizes[i]; break; }
    }

    return this.spawn(x, y, chosen);
  };

  AsteroidManager.prototype.update = function (dt, canvasWidth, canvasHeight) {
    for (var i = 0; i < this.asteroids.length; i++) {
      this.asteroids[i].update(dt, canvasWidth, canvasHeight);
    }
    this.asteroids = this.asteroids.filter(function (a) { return a.isActive; });
  };

  AsteroidManager.prototype.draw = function (ctx) {
    for (var i = 0; i < this.asteroids.length; i++) {
      this.asteroids[i].draw(ctx);
    }
  };

  AsteroidManager.prototype.clear = function () {
    this.asteroids = [];
  };

  AsteroidManager.prototype.addFragments = function (asteroid) {
    var frags = asteroid.getFragments();
    for (var i = 0; i < frags.length; i++) {
      frags[i].manager = this;
      this.asteroids.push(frags[i]);
    }
    return frags;
  };

  global.Asteroid        = Asteroid;
  global.AsteroidManager = AsteroidManager;

}(window));
