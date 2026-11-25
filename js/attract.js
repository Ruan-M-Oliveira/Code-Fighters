(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   * ATTRACT MODE — the cabinet plays itself while nobody is around.
   *
   *   AttractModeManager  idle timer, intro/outro curtain, interruption
   *   DemoAI              a believable (fallible) pilot that writes to its
   *                       own input object; the real Player, weapons,
   *                       collisions, waves and boss run unchanged.
   *
   * The demo never touches persistence: Game.isDemoMode makes every
   * high-score / leaderboard path a no-op (see game.js + leaderboard.js).
   * ═══════════════════════════════════════════════════════════════════════ */

  var CONFIG = {
    idleDelay: 10,          // s of inactivity on the main menu before a demo
    restDelay: 12,          // s the menu stays up after a demo before the next one
    maxDuration: 150,       // s safety cap for a single demo
    introTime: 0.9,         // curtain before the demo starts
    outroTime: 0.8,         // curtain before returning to the menu
    // starting point of each demo (upgrades = what a player would have earned)
    starts: [
      { wave: 1, upgrades: 0, weight: 3 },
      { wave: 3, upgrades: 2, weight: 2 },
      { wave: 5, upgrades: 4, weight: 2 }   // boss showcase
    ],
    // pilot skill: tuned to look good but die eventually
    skill: {
      think: 0.09,          // s between decisions (reaction time)
      scan: 240,            // px radius in which bullets are noticed
      margin: 30,           // extra px kept from predicted bullet paths
      aimError: 0.08,       // rad of wandering aim error
      lapseEvery: [5, 10],  // s between lapses of attention
      lapseTime: [0.4, 0.9] // s a lapse lasts (dodging mostly ignored)
    }
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ═════════════════════════════ DemoAI ═════════════════════════════ */

  function DemoAI(game) {
    this.game = game;
    this.input = {
      up: false, down: false, left: false, right: false,
      fire: false, special: false,
      mouse: { x: 0, y: 0 },
      touch: { active: false, x: 0, y: 0 }
    };
    this.reset();
  }

  DemoAI.prototype.reset = function () {
    var i = this.input;
    i.up = i.down = i.left = i.right = i.fire = i.special = false;
    i.touch.active = false;
    this.target = null;
    this._thinkT = 0;
    this._aimErr = 0;
    this._aimDrift = 0;
    this._strafe = Math.random() * 6.28;
    this._lapseIn = rand(CONFIG.skill.lapseEvery[0], CONFIG.skill.lapseEvery[1]);
    this._lapse = 0;
    this._holdFire = 0;
    this.status = 'ENGAJANDO';
    this.aimX = 0;
    this.aimY = 0;
  };

  DemoAI.prototype.update = function (dt) {
    var S = CONFIG.skill;
    // attention lapses: the pilot occasionally stops watching bullets
    if (this._lapse > 0) this._lapse -= dt;
    else if ((this._lapseIn -= dt) <= 0) {
      this._lapse = rand(S.lapseTime[0], S.lapseTime[1]);
      this._lapseIn = rand(S.lapseEvery[0], S.lapseEvery[1]);
    }
    this._strafe += dt * 0.9;
    this._aimDrift += dt;
    this._aimErr = Math.sin(this._aimDrift * 1.7) * S.aimError + Math.sin(this._aimDrift * 4.3) * S.aimError * 0.4;

    this._thinkT -= dt;
    if (this._thinkT <= 0) {
      this._thinkT = S.think * rand(0.8, 1.25);
      this._think();
    }
    this._aim();
    this.input.special = false;
    if (this._wantSpecial) { this.input.special = true; this._wantSpecial = false; }
  };

  // aim every frame at the current target, leading it by bullet travel time
  DemoAI.prototype._aim = function () {
    var p = this.game.player, t = this.target;
    var ax, ay;
    if (t && t.active !== false) {
      var dx = t.x - p.x, dy = t.y - p.y;
      // lead the target by this ship's own projectile speed
      var travel = Math.sqrt(dx * dx + dy * dy) / (p.ship ? p.ship.weapon.speed : 820);
      ax = t.x + (t.vx || 0) * travel - p.x;
      ay = t.y + (t.vy || 0) * travel - p.y;
    } else {
      ax = 0; ay = -1;
    }
    var a = Math.atan2(ay, ax) + this._aimErr;
    this.aimX = p.x + Math.cos(a) * 260;
    this.aimY = p.y + Math.sin(a) * 260;
    this.input.mouse.x = this.aimX;
    this.input.mouse.y = this.aimY;
  };

  DemoAI.prototype._pickTarget = function () {
    var g = this.game, p = g.player;
    var boss = g.bossMgr.boss;
    if (boss && boss.active && !boss.entering && !boss.dying) return boss;
    var best = null, bestScore = Infinity, i, e, d;
    var en = g.enemies.enemies;
    for (i = 0; i < en.length; i++) {
      e = en[i];
      if (!e.active || e.y < -10) continue;
      d = Math.sqrt((e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y));
      // shooters and close kamikazes are the priority
      var w = d * (e.type === 'hunter' || e.type === 'striker' ? 0.8 : 1) * (e.dieOnContact && d < 220 ? 0.6 : 1);
      if (w < bestScore) { bestScore = w; best = e; }
    }
    if (best) return best;
    var as = g.asteroids.asteroids;
    for (i = 0; i < as.length; i++) {
      e = as[i];
      if (!e.active || e.y < 0) continue;
      d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
      if (d < bestScore * bestScore || !best) { bestScore = Math.sqrt(d); best = e; }
    }
    return best;
  };

  DemoAI.prototype._think = function () {
    var g = this.game, p = g.player, S = CONFIG.skill;
    var W = g.width, H = g.height;
    var fx = 0, fy = 0, threat = 0;
    var i, dx, dy, d, R, w;
    var alert = this._lapse > 0 ? 0.15 : 1;

    this.target = this._pickTarget();

    // 1. hostile bullets: predict the closest approach and step off the line
    var pl = g.projectiles.projectiles, nearBullets = 0;
    for (i = 0; i < pl.length; i++) {
      var q = pl[i];
      if (!q.active || q.type === 'player') continue;
      dx = q.x - p.x; dy = q.y - p.y;
      if (dx * dx + dy * dy > S.scan * S.scan) continue;
      if (dx * dx + dy * dy < 150 * 150) nearBullets++;
      var vx = q.vx - p.vx * 0.5, vy = q.vy - p.vy * 0.5;
      var vv = vx * vx + vy * vy || 1;
      var tca = clamp(-(dx * vx + dy * vy) / vv, 0, 0.9);
      var cx = dx + vx * tca, cy = dy + vy * tca;
      var miss = Math.sqrt(cx * cx + cy * cy);
      R = (q.radius || 5) + p.radius + S.margin;
      if (miss < R) {
        w = (1 - miss / R) * (1 - tca * 0.6) * 3.2 * alert;
        if (miss < 2) { cx = -vy; cy = vx; miss = Math.sqrt(cx * cx + cy * cy) || 1; }   // dead centre: sidestep
        fx -= cx / miss * w;
        fy -= cy / miss * w;
        threat += w;
      }
    }

    // 2. enemy bodies (kamikazes count double)
    var en = g.enemies.enemies, nearEnemies = 0;
    for (i = 0; i < en.length; i++) {
      var e = en[i];
      if (!e.active) continue;
      dx = (e.x + (e.vx || 0) * 0.25) - p.x; dy = (e.y + (e.vy || 0) * 0.25) - p.y;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 230) nearEnemies++;
      R = e.radius + p.radius + (e.dieOnContact ? 110 : 80);
      if (d < R) {
        w = Math.pow(1 - d / R, 2) * (e.dieOnContact ? 3.5 : 2.2) * (0.5 + 0.5 * alert);
        fx -= dx / d * w; fy -= dy / d * w; threat += w;
      }
    }

    // 3. asteroids, judged where they will be shortly
    var as = g.asteroids.asteroids;
    for (i = 0; i < as.length; i++) {
      var a = as[i];
      if (!a.active) continue;
      dx = (a.x + a.vx * 0.4) - p.x; dy = (a.y + a.vy * 0.4) - p.y;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      R = a.radius + p.radius + 55;
      if (d < R) {
        w = Math.pow(1 - d / R, 2) * 2.6 * (0.6 + 0.4 * alert);
        fx -= dx / d * w; fy -= dy / d * w; threat += w;
      }
    }

    // 4. boss: keep a respectful distance, dodge the charge line
    var boss = g.bossMgr.boss, bossLive = boss && boss.active && !boss.dying;
    if (bossLive) {
      dx = boss.x - p.x; dy = boss.y - p.y;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      R = boss.radius + 190;
      if (d < R) { w = (1 - d / R) * 3; fx -= dx / d * w; fy -= dy / d * w; threat += w; }
      if (boss.chargeState === 'telegraph' || boss.chargeState === 'charge') {
        var lx = boss.lockX - boss.x, ly = boss.lockY - boss.y;
        var ll = Math.sqrt(lx * lx + ly * ly) || 1;
        var nx = -ly / ll, ny = lx / ll;                  // normal of the charge line
        var side = (p.x - boss.x) * nx + (p.y - boss.y) * ny;
        var sgn = side >= 0 ? 1 : -1;
        if (Math.abs(side) < boss.radius + 70) {
          fx += nx * sgn * 3.5 * alert; fy += ny * sgn * 3.5 * alert; threat += 3;
        }
      }
    }

    // 5. walls
    var m = 80;
    if (p.x < m) fx += (1 - p.x / m) * 2;
    if (p.x > W - m) fx -= (1 - (W - p.x) / m) * 2;
    if (p.y < H * 0.3) fy += 1.2;
    if (p.y > H - m) fy -= (1 - (H - p.y) / m) * 2;

    // 6. goals: a firing position below the target, gently strafing
    // ship personality: preferred range and strafing width (same AI, tuned per ship)
    var SA = (p.ship && p.ship.ai) || { range: 230, strafe: 70 };
    var t = this.target, gx, gy;
    if (t) {
      gx = t.x + Math.sin(this._strafe) * (bossLive ? 160 : SA.strafe);
      gy = bossLive ? H * 0.78 : Math.max(t.y + SA.range, H * 0.64);
      this.status = bossLive ? 'COMBATE: CHEFE' : 'ENGAJANDO';
    } else {
      gx = W / 2 + Math.sin(this._strafe * 0.6) * W * 0.2;
      gy = H * 0.74;
      this.status = 'PATRULHANDO';
    }
    // pick up power-ups / upgrade cores when it is reasonably safe
    var pu = g.powerups.powerups, best = null, bd = 380;
    if (threat < 1.2) {
      for (i = 0; i < pu.length; i++) {
        var u = pu[i];
        if (!u.active) continue;
        dx = u.x - p.x; dy = u.y - p.y;
        d = Math.sqrt(dx * dx + dy * dy);
        var pref = u.type === 'UPGRADE' ? 0.6 : (u.type === 'REPAIR' && p.health < 60 ? 0.5 : 1);
        if (d * pref < bd) { bd = d * pref; best = u; }
      }
    }
    if (best) { gx = best.x; gy = best.y; this.status = 'COLETANDO'; }
    gy = clamp(gy, H * 0.32, H - 60);
    gx = clamp(gx, 60, W - 60);
    dx = gx - p.x; dy = gy - p.y;
    d = Math.sqrt(dx * dx + dy * dy);
    if (d > 12) {
      var pull = Math.min(1, d / 160) * (threat > 1.5 ? 0.35 : 0.9);
      fx += dx / d * pull; fy += dy / d * pull;
    }
    if (threat > 1.5) this.status = 'DESVIANDO';

    // 7. turn the force into keyboard-style input (same as a human pilot)
    var mag = Math.sqrt(fx * fx + fy * fy);
    var inp = this.input;
    if (mag < 0.22) {
      inp.left = inp.right = inp.up = inp.down = false;
    } else {
      var ux = fx / mag, uy = fy / mag;
      inp.left = ux < -0.38; inp.right = ux > 0.38;
      inp.up = uy < -0.38; inp.down = uy > 0.38;
    }

    // 8. shooting: hold fire while something is in sight, with short breathers
    if (this._holdFire > 0) this._holdFire -= CONFIG.skill.think;
    else if (Math.random() < 0.03) this._holdFire = rand(0.2, 0.5);
    inp.fire = !!t && this._holdFire <= 0;

    // 9. special weapon when it would really pay off
    if (p.up.SPECIAL > 0 && p.specialCD <= 0 &&
        (nearEnemies >= 3 || nearBullets >= 5 || (bossLive && Math.abs(boss.x - p.x) < 260 && Math.abs(boss.y - p.y) < 330))) {
      this._wantSpecial = true;
    }
  };

  /* ═════════════════════════════ AttractModeManager ═════════════════════════════ */

  var AttractMode = {
    config: CONFIG,
    game: null,
    ai: null,
    phase: 'idle',          // idle | intro | running | outro
    idleT: 0,
    restT: 0,
    _t: 0,
    _runT: 0,
    _curtain: null,
    _lastMX: null,
    _lastMY: null,
    _swallowClickUntil: 0,

    init: function (game) {
      this.game = game;
      this.ai = new DemoAI(game);
      this._buildCurtain();
      var self = this;
      // capture phase: we see every input first and can swallow the one
      // that ends a demo, so it never turns into a menu click or a shot
      var opts = { capture: true, passive: false };
      global.addEventListener('keydown', function (e) { self._onActivity(e, true); }, opts);
      global.addEventListener('mousedown', function (e) { self._onActivity(e, true); }, opts);
      global.addEventListener('pointerdown', function (e) { self._onActivity(e, true); }, opts);
      global.addEventListener('touchstart', function (e) { self._onActivity(e, true); }, opts);
      global.addEventListener('wheel', function (e) { self._onActivity(e, false); }, { capture: true, passive: true });
      global.addEventListener('mousemove', function (e) {
        // ignore synthetic / zero-distance moves (layout changes under a still cursor)
        var mx = e.clientX, my = e.clientY;
        var moved = self._lastMX === null || Math.abs(mx - self._lastMX) + Math.abs(my - self._lastMY) > 3;
        self._lastMX = mx; self._lastMY = my;
        if (moved) self._onActivity(e, false);
      }, true);
      global.addEventListener('click', function (e) {
        if (performance.now() < self._swallowClickUntil) { e.stopImmediatePropagation(); e.preventDefault(); }
      }, true);
    },

    isActive: function () { return this.phase !== 'idle'; },

    _buildCurtain: function () {
      var c = document.createElement('div');
      c.id = 'demo-curtain';
      c.setAttribute('aria-hidden', 'true');
      c.innerHTML =
        '<div class="dc-inner">' +
          '<div class="dc-logo">CODE FIGHTERS</div>' +
          '<div class="dc-title" id="dc-title">DEMONSTRAÇÃO</div>' +
          '<div class="dc-ship" id="dc-ship"></div>' +
          '<div class="dc-sub" id="dc-sub">PRESSIONE QUALQUER TECLA PARA JOGAR</div>' +
        '</div>';
      document.body.appendChild(c);
      this._curtain = c;
    },

    _showCurtain: function (title, sub, shipLine) {
      var c = this._curtain;
      if (!c) return;
      document.getElementById('dc-title').textContent = title;
      document.getElementById('dc-sub').textContent = sub;
      var sl = document.getElementById('dc-ship');
      if (sl) sl.textContent = shipLine || '';
      c.classList.add('show');
    },

    _hideCurtain: function (instant) {
      var c = this._curtain;
      if (!c) return;
      if (instant) { c.classList.add('instant'); c.classList.remove('show'); void c.offsetWidth; c.classList.remove('instant'); }
      else c.classList.remove('show');
    },

    _eligible: function () {
      var g = this.game;
      var loading = document.getElementById('loading-screen');
      return g.state === global.GAME_STATES.MENU &&
        global.UIManager.current === 'main' &&
        !document.hidden &&
        !(loading && !loading.classList.contains('hidden'));
    },

    _onActivity: function (e, swallow) {
      if (this.phase === 'idle') {
        this.idleT = 0;
        // the mousedown that follows the pointerdown which ended a demo
        if (swallow && e && performance.now() < this._swallowClickUntil) e.stopImmediatePropagation();
        return;
      }
      // any real input ends the demo at once
      if (swallow && e) {
        var k = e.key || '';
        var browserKey = /^F\d+$/.test(k) || e.ctrlKey || e.metaKey || e.altKey;
        if (!browserKey) { e.preventDefault(); }
        e.stopImmediatePropagation();
        this._swallowClickUntil = performance.now() + 450;
      }
      // the gesture still counts for unlocking audio
      try { this.game.audio.init(); this.game.audio.music.unlock(); } catch (err) { /* ignore */ }
      this.interrupt();
    },

    update: function (dt) {
      var g = this.game;
      switch (this.phase) {
        case 'idle':
          if (this.restT > 0) this.restT -= dt;
          if (this._eligible()) {
            this.idleT += dt;
            if (this.idleT >= CONFIG.idleDelay && this.restT <= 0) this.start();
          } else {
            this.idleT = 0;
          }
          break;
        case 'intro':
          this._t -= dt;
          if (this._t <= 0) this._launch();
          break;
        case 'running':
          // a player run took over without an interrupt: stand down quietly
          if (!g.isDemoMode) { this.reset(); break; }
          this._runT += dt;
          if (this._runT >= CONFIG.maxDuration && g.isGameplay()) this.finish('timeout');
          break;
        case 'outro':
          this._t -= dt;
          if (this._t <= 0) this._close();
          break;
      }
    },

    start: function () {
      if (this.phase !== 'idle') return;
      this.phase = 'intro';
      this._t = CONFIG.introTime;
      // a different fighter than last time, so passers-by see the variety
      this._ship = global.Ships ? global.Ships.random(this._lastShip) : null;
      this._lastShip = this._ship;
      var sh = this._ship && global.Ships.get(this._ship);
      this._showCurtain('DEMONSTRAÇÃO', 'PRESSIONE QUALQUER TECLA PARA JOGAR',
        sh ? 'NAVE ' + sh.num + ' · ' + sh.name + ' · ' + sh.weaponName : '');
    },

    _pickStart: function () {
      var list = CONFIG.starts, total = 0, i;
      for (i = 0; i < list.length; i++) total += list[i].weight;
      var r = Math.random() * total;
      for (i = 0; i < list.length; i++) { r -= list[i].weight; if (r <= 0) return list[i]; }
      return list[0];
    },

    _launch: function () {
      var s = this._pickStart();
      this.ai.reset();
      this.phase = 'running';
      this._runT = 0;
      this.game.startDemo(s.wave, s.upgrades, this._ship);
      this._hideCurtain(false);
    },

    /** Natural end (death / timeout / victory): curtain, then back to the menu. */
    finish: function (reason) {
      if (this.phase !== 'running') return;
      this.phase = 'outro';
      this._t = CONFIG.outroTime;
      this.ai.reset();
      this._showCurtain('FIM DA DEMONSTRAÇÃO', reason === 'died' ? 'O PILOTO CPU FOI ABATIDO · SUA VEZ!' : 'SUA VEZ, PILOTO!');
    },

    _close: function () {
      this.game.exitDemo();
      this.phase = 'idle';
      this.idleT = 0;
      this.restT = CONFIG.restDelay;
      this._hideCurtain(false);
    },

    /** Drops any demo bookkeeping without touching the game (a player run is starting). */
    reset: function () {
      if (this.phase === 'idle') return;
      this.ai.reset();
      this.phase = 'idle';
      this.idleT = 0;
      this.restT = 0;
      this._hideCurtain(true);
    },

    /** Player interaction: stop immediately and hand the cabinet back. */
    interrupt: function () {
      if (this.phase === 'idle') return;
      var wasIntro = this.phase === 'intro';
      this.ai.reset();
      this.phase = 'idle';
      this.idleT = 0;
      this.restT = 0;
      if (!wasIntro) this.game.exitDemo();
      this._hideCurtain(true);
    }
  };

  global.DemoAI = DemoAI;
  global.AttractMode = AttractMode;
}(typeof window !== 'undefined' ? window : this));
