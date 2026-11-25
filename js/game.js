(function (global) {
  'use strict';

  var S = global.GAME_STATES;
  var COLORS = global.COLORS;
  var SAVE_KEY = 'codefighters_save_v1';
  var SETTINGS_KEY = 'codefighters_settings_v1';
  // keys used before the CODE FIGHTERS rename: read once so records are kept
  var LEGACY_SAVE_KEY = 'starfall_save_v1';
  var LEGACY_SETTINGS_KEY = 'starfall_settings_v1';
  var SHIP_KEY = 'codefighters_ship_v1';

  var DIFFICULTIES = ['easy', 'normal', 'hard'];
  var DIFF = {
    easy:   { label: 'FÁCIL',   enemyHealth: 0.8, damageTaken: 0.7 },
    normal: { label: 'NORMAL',  enemyHealth: 1.0, damageTaken: 1.0 },
    hard:   { label: 'DIFÍCIL', enemyHealth: 1.3, damageTaken: 1.4 }
  };

  var POWERUP_NAMES = {
    SHIELD: 'ESCUDO', RAPID_FIRE: 'TIRO RÁPIDO', MULTI_SHOT: 'TIRO TRIPLO',
    SPEED_BOOST: 'TURBO', REPAIR: 'CASCO REPARADO'
  };
  var POWERUP_COLORS = {
    SHIELD: '#4488ff', RAPID_FIRE: '#ffcc00', MULTI_SHOT: '#00eeff',
    SPEED_BOOST: '#44ff88', REPAIR: '#ff4488'
  };

  function rand(a, b) { return a + Math.random() * (b - a); }

  // localStorage can throw (private mode, quota, blocked) — never let it break the game
  function safeGet(key) {
    try {
      var v = global.localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }
  function safeSet(key, obj) {
    try { global.localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }

  var Game = {
    canvas: null,
    ctx: null,
    width: 960,
    height: 600,
    dpr: 1,

    state: S.MENU,
    pausedFrom: S.PLAYING,
    time: 0,
    dt: 0.016,
    _last: 0,
    _menuT: 0,

    shake: 0,
    damageFlash: 0,
    waveBonus: 0,
    bannerObj: null,
    floaters: [],
    notices: [],

    settings: { sound: true, shake: true, difficulty: 'normal', volume: 80, music: 70 },
    save: { highScore: 0, bestWave: 0 },
    stats: { enemiesDefeated: 0, asteroidsDestroyed: 0, maxWave: 1 },

    input: {
      up: false, down: false, left: false, right: false,
      keyFire: false, mouseFire: false, fire: false,
      keySpecial: false, mouseSpecial: false, special: false,
      mouse: { x: 480, y: 200 },
      touch: { active: false, x: 0, y: 0 }
    },

    _endTimer: 0,
    _endScreen: null,

    // arcade leaderboard: pilot callsign + id of the current run
    callsign: '',
    runId: '',
    // attract mode: the CPU pilot plays; nothing it does is ever persisted
    isDemoMode: false,
    // the human player's fighter (the demo picks its own without touching this)
    shipId: 'interceptor',
    runRecordedId: null,   // set once the run is in the Top 3 storage (victory)
    _liveRank: 0,
    _rankScore: -1,
    _endStats: null,
    _ambientTimer: 8,
    _layers: [],
    _nebula: null,
    _dbg: {},
    _dbgList: [],

    /* ═════════════════════════════ setup ═════════════════════════════ */

    init: function () {
      var self = this;
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');

      // --- subsystems (each one owns its own entity array) ---
      this.audio = new global.AudioManager();
      this.particles = new global.ParticleSystem(900);
      global.particleSystem = this.particles;           // CollisionManager reads this global
      this.projectiles = new global.ProjectileManager();
      this.enemies = new global.EnemyManager();
      this.asteroids = new global.AsteroidManager();
      this.powerups = new global.PowerUpManager();
      this.bossMgr = new global.BossManager();
      this.collisions = new global.CollisionManager();
      this.player = new global.Player(0, 0);

      this.enemies.projectiles = this.projectiles;
      this.enemies.audio = this.audio;
      this.bossMgr.projectiles = this.projectiles;
      this.bossMgr.enemies = this.enemies;
      this.bossMgr.particles = this.particles;
      this.bossMgr.audio = this.audio;

      // --- event hooks ---
      this.enemies.onKill = function (e) { self.onEnemyKilled(e); };
      this.asteroids.onDestroyed = function (a) { self.onAsteroidDestroyed(a); };
      this.bossMgr.onPhase = function (n) { self.onBossPhase(n); };
      this.bossMgr.onDying = function () { self.onBossDying(); };
      this.bossMgr.onDefeated = function (b) { self.onBossDefeated(b); };
      this.bossMgr.onShake = function (m) { self.addShake(m); };
      this._wirePlayer();

      var WM = global.WaveManager;
      WM.onWaveComplete = function (w) { self.onWaveComplete(w); };
      WM.onBossWave = function (w) { self.onBossWave(w); };
      var origStart = WM.startWave;
      WM.startWave = function (n) { self.beforeWaveStart(n); origStart.call(WM, n); self.onWaveStart(n); };

      this._loadPersisted();
      var savedShip = safeGet(SHIP_KEY);
      if (typeof savedShip === 'string' && global.Ships.byId[savedShip]) this.shipId = savedShip;
      this.audio.enabled = this.settings.sound;
      this.audio.music.enabled = this.settings.sound;
      this.audio.setMasterVolume(this.settings.volume / 100);
      this.audio.setMusicVolume(this.settings.music / 100);

      this._bindInput();
      global.addEventListener('resize', function () { self.resize(); });
      document.addEventListener('fullscreenchange', function () {
        self.resize();
        if (global.UIManager.refreshSettings) global.UIManager.refreshSettings();
      });
      this.resize();

      global.UIManager.init(this);
      global.DebugManager.init();
      if (global.AttractMode) global.AttractMode.init(this);
      if (global.GamepadInput) global.GamepadInput.init(this);

      this.enterMenu();
      this._runLoading();

      this._last = performance.now();
      global.requestAnimationFrame(function (ts) { self._loop(ts); });
    },

    _wirePlayer: function () {
      var self = this;
      this.player.onDamage = function () {
        self.addShake(9);
        self.damageFlash = 0.35;
        if (!self.isDemoMode && global.GamepadInput) global.GamepadInput.rumble(0.7, 0.4, 170);
      };
      this.player.onPowerUp = function (type) {
        self.addFloater(self.player.x, self.player.y - 30, POWERUP_NAMES[type] || type, POWERUP_COLORS[type] || '#ffffff', 15);
      };
      this.player.onUpgrade = function (key, lvl, max, tierUp) { self.onUpgrade(key, lvl, max, tierUp); };
      this.player.onBarrier = function () {
        var p = self.player;
        self.audio.play('barrier');
        self.particles.emitCollect(p.x, p.y, { color: '#66b8ff', count: 12, spread: 2.2 });
        self.addFloater(p.x, p.y - 30, 'BARREIRA ABSORVEU', '#66b8ff', 13);
        self.addShake(4);
      };
      this.player.onSpecial = function (lvl) { self.fireSpecial(lvl); };
      this.player.onSpecialReady = function () {
        self.audio.play('specialReady');
        self.addFloater(self.player.x, self.player.y - 30, 'ONDA DE CHOQUE PRONTA', '#c58cff', 12);
      };
    },

    _runLoading: function () {
      var bar = document.getElementById('loading-bar');
      var label = document.getElementById('loading-text');
      var screen = document.getElementById('loading-screen');
      var steps = [
        [30, 'Calibrando sensores...'],
        [60, 'Gerando campo estelar...'],
        [85, 'Armando os canhões...'],
        [100, 'Sinal adquirido']
      ];
      var i = 0;
      function next() {
        if (i < steps.length) {
          if (bar) bar.style.width = steps[i][0] + '%';
          if (label) label.textContent = steps[i][1];
          i++;
          setTimeout(next, 260);
        } else if (screen) {
          screen.classList.add('hidden');
        }
      }
      next();
    },

    _loadPersisted: function () {
      var s = safeGet(SETTINGS_KEY) || safeGet(LEGACY_SETTINGS_KEY);
      if (s) {
        if (typeof s.sound === 'boolean') this.settings.sound = s.sound;
        if (typeof s.shake === 'boolean') this.settings.shake = s.shake;
        if (DIFF[s.difficulty]) this.settings.difficulty = s.difficulty;
        if (typeof s.volume === 'number') this.settings.volume = Math.max(0, Math.min(100, s.volume));
        if (typeof s.music === 'number') this.settings.music = Math.max(0, Math.min(100, s.music));
      }
      var v = safeGet(SAVE_KEY) || safeGet(LEGACY_SAVE_KEY);
      if (v) {
        this.save.highScore = Math.max(0, Number(v.highScore) || 0);
        this.save.bestWave = Math.max(0, Number(v.bestWave) || 0);
      }
    },

    resize: function () {
      this.dpr = Math.min(global.devicePixelRatio || 1, 1.5);
      var w = global.innerWidth || 960, h = global.innerHeight || 600;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.width = w;
      this.height = h;
      this.enemies.canvasWidth = w;
      this.enemies.canvasHeight = h;
      this.bossMgr.canvasWidth = w;
      this.bossMgr.canvasHeight = h;
      if (this.player) {
        this.player.x = Math.min(Math.max(this.player.x, 20), w - 20);
        this.player.y = Math.min(Math.max(this.player.y, 20), h - 20);
      }
      this._buildBackground();
    },

    /* ═════════════════════════════ settings ═════════════════════════════ */

    setSetting: function (key, val) {
      this.settings[key] = val;
      if (key === 'sound') {
        this.audio.setEnabled(val);
        if (val) this.audio.init();
      } else if (key === 'volume') {
        this.audio.setMasterVolume(val / 100);
      } else if (key === 'music') {
        this.audio.setMusicVolume(val / 100);
      }
      safeSet(SETTINGS_KEY, this.settings);
    },

    cycleDifficulty: function () {
      var i = DIFFICULTIES.indexOf(this.settings.difficulty);
      this.settings.difficulty = DIFFICULTIES[(i + 1) % DIFFICULTIES.length];
      safeSet(SETTINGS_KEY, this.settings);
    },

    difficultyLabel: function () { return DIFF[this.settings.difficulty].label; },

    toggleFullscreen: function () {
      try {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      } catch (e) { /* not supported */ }
    },

    resetSave: function () {
      this.save = { highScore: 0, bestWave: 0 };
      safeSet(SAVE_KEY, this.save);
    },

    /* ═════════════════════════════ input ═════════════════════════════ */

    _bindInput: function () {
      var self = this, inp = this.input;
      var keyMap = {
        KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
        KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right'
      };

      // Browsers only allow audio after a user gesture
      // (the soundtrack retries a track the browser refused to autoplay)
      function firstGesture() {
        self.audio.init();
        self.audio.music.unlock();
      }
      document.addEventListener('pointerdown', firstGesture);
      document.addEventListener('keydown', firstGesture);

      global.addEventListener('keydown', function (e) {
        // typing the callsign must never pause, move or fire
        var tgt = e.target;
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') && e.code !== 'Escape') return;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (!e.repeat) self.handleEscape();
          return;
        }
        if (keyMap[e.code]) { inp[keyMap[e.code]] = true; if (self.isGameplay()) e.preventDefault(); }
        if (e.code === 'Space') {
          inp.keyFire = true; inp.fire = true;
          if (self.isGameplay()) e.preventDefault();
        }
        if (e.code === 'KeyQ' || e.code === 'KeyE') { inp.keySpecial = true; inp.special = true; }
      });
      global.addEventListener('keyup', function (e) {
        if (keyMap[e.code]) inp[keyMap[e.code]] = false;
        if (e.code === 'Space') { inp.keyFire = false; inp.fire = inp.mouseFire; }
        if (e.code === 'KeyQ' || e.code === 'KeyE') { inp.keySpecial = false; inp.special = inp.mouseSpecial; }
      });
      global.addEventListener('mousemove', function (e) {
        inp.mouse.x = e.clientX;
        inp.mouse.y = e.clientY;
      });
      this.canvas.addEventListener('mousedown', function (e) {
        if (e.button === 0) { inp.mouseFire = true; inp.fire = true; }
        if (e.button === 2) { inp.mouseSpecial = true; inp.special = true; }
      });
      global.addEventListener('mouseup', function (e) {
        if (e.button === 0) { inp.mouseFire = false; inp.fire = inp.keyFire; }
        if (e.button === 2) { inp.mouseSpecial = false; inp.special = inp.keySpecial; }
      });
      this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      // basic touch controls: the ship follows the finger and auto-fires
      function touch(e, on) {
        var t = e.touches && e.touches[0];
        if (on && t) { inp.touch.active = true; inp.touch.x = t.clientX; inp.touch.y = t.clientY; }
        else if (!e.touches || e.touches.length === 0) inp.touch.active = false;
        if (self.isGameplay()) e.preventDefault();
      }
      this.canvas.addEventListener('touchstart', function (e) { touch(e, true); }, { passive: false });
      this.canvas.addEventListener('touchmove', function (e) { touch(e, true); }, { passive: false });
      this.canvas.addEventListener('touchend', function (e) { touch(e, false); }, { passive: false });
      this.canvas.addEventListener('touchcancel', function (e) { touch(e, false); }, { passive: false });

      // losing focus pauses the game and releases every key
      function release() {
        inp.up = inp.down = inp.left = inp.right = false;
        inp.keyFire = inp.mouseFire = inp.fire = false;
        inp.keySpecial = inp.mouseSpecial = inp.special = false;
      }
      global.addEventListener('blur', function () { release(); if (self.isGameplay() && !self.isDemoMode) self.pause(); });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) return;
        release();
        // a hidden tab ends the demo (nobody is watching); a real run pauses
        if (self.isDemoMode && global.AttractMode) global.AttractMode.interrupt();
        else if (self.isGameplay()) self.pause();
      });

      // keep the high score even if the tab is closed mid-run
      global.addEventListener('beforeunload', function () {
        if (self.isGameplay() && !self.isDemoMode && self.player.score > self.save.highScore) {
          self.save.highScore = self.player.score;
          safeSet(SAVE_KEY, self.save);
        }
      });
    },

    handleEscape: function () {
      if (this.isGameplay()) this.pause();
      else if (this.state === S.PAUSED) this.resume();
      else if (this.state === S.MENU && global.UIManager.current === 'ships') {
        global.UIManager.openCallsign(true);      // one step back: keep the typed callsign
      }
      else if (this.state === S.MENU && global.UIManager.current && global.UIManager.current !== 'main') {
        global.UIManager.show('main');
      }
    },

    /* ═════════════════════════════ state machine ═════════════════════════════ */

    isGameplay: function () { return this.state === S.PLAYING || this.state === S.BOSS; },

    _setCursor: function (hidden) {
      if (this.canvas && this.canvas.style) this.canvas.style.cursor = hidden ? 'none' : 'default';
    },

    enterMenu: function () {
      this.state = S.MENU;
      this.enemies.clear();
      this.asteroids.clear();
      this.projectiles.clear();
      this.powerups.clear();
      this.particles.clear();
      this.bossMgr.reset();
      this.floaters.length = 0;
      this.notices.length = 0;
      this.bannerObj = null;
      this._menuT = 0;
      this.player.setShip(this.shipId);
      this.player.reset(this.width * 0.7, this.height * 0.55);
      this._wirePlayer();

      // slow decorative asteroids drifting behind the title
      var sizes = ['large', 'medium', 'medium', 'small', 'large', 'small'];
      for (var i = 0; i < sizes.length; i++) {
        var a = rand(0, Math.PI * 2), sp = rand(8, 22);
        this.asteroids.spawn(rand(0, this.width), rand(0, this.height), sizes[i], Math.cos(a) * sp, Math.sin(a) * sp);
      }
      global.UIManager.show('main');
      this.audio.music.setPaused(false);
      this.audio.music.play('title', { restart: true });
      this._setCursor(false);
    },

    startGame: function (callsign, opts) {
      opts = opts || {};
      var LB = global.Leaderboard;
      // a player run always clears the demo flag; only startDemo() sets it
      if (!opts.demo && global.AttractMode) global.AttractMode.reset();
      this.isDemoMode = !!opts.demo;
      if (!this.isDemoMode) {
        if (callsign) this.callsign = callsign;
        if (!this.callsign) this.callsign = LB.lastCallsign() || 'PILOTO';
      }
      // every run gets its own id: the Top 3 is updated once per run
      this.runId = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      this.runRecordedId = null;
      this._liveRank = 0;
      this._rankScore = -1;
      LB.load();
      this.audio.init();
      this.audio.stopAmbient();
      this.audio.music.setPaused(false);
      this.audio.music.play('gaming', { restart: true });
      var D = DIFF[this.settings.difficulty];
      this.enemies.difficulty = { health: D.enemyHealth, speed: 1 };
      this.bossMgr.difficulty = { health: D.enemyHealth, speed: 1 };

      this.enemies.clear();
      this.asteroids.clear();
      this.projectiles.clear();
      this.powerups.clear();
      this.particles.clear();
      this.bossMgr.reset();
      this.floaters.length = 0;
      this.notices.length = 0;
      this.bannerObj = null;

      // ship: the demo brings its own; a player run uses (and remembers) theirs
      if (this.isDemoMode) {
        this.player.setShip(opts.ship || global.Ships.DEFAULT);
      } else {
        if (opts.ship && global.Ships.byId[opts.ship]) {
          this.shipId = opts.ship;
          safeSet(SHIP_KEY, this.shipId);
        }
        this.player.setShip(this.shipId);
      }
      this.player.reset(this.width / 2, this.height * 0.8);
      this.player.damageMult = D.damageTaken;
      this._wirePlayer();

      this.stats = { enemiesDefeated: 0, asteroidsDestroyed: 0, maxWave: 1 };
      this.shake = 0;
      this.damageFlash = 0;
      this.waveBonus = 0;
      this._endTimer = 0;
      this._endScreen = null;
      this._ambientTimer = 8;
      this.input.fire = this.input.keyFire = this.input.mouseFire = false;
      this.input.special = this.input.keySpecial = this.input.mouseSpecial = false;

      // demo only: upgrades a pilot would have earned before the start wave
      if (opts.upgrades) {
        var pl = this.player, cb = pl.onUpgrade;
        pl.onUpgrade = null;
        for (var u = 0; u < opts.upgrades; u++) pl.applyUpgrade(pl.rollUpgrade());
        pl.onUpgrade = cb;
      }

      global.WaveManager.init(this.enemies, this.asteroids, this.bossMgr);
      this.state = S.PLAYING;
      global.UIManager.hideAll();
      global.UIManager.resetHudState();
      this._setCursor(!this.isDemoMode);
      global.WaveManager.startWave(opts.startWave || 1);
    },

    /* ── attract mode ── */

    startDemo: function (wave, upgrades, ship) {
      this.startGame(null, { demo: true, startWave: wave || 1, upgrades: upgrades || 0, ship: ship });
    },

    /** Ends a demo and discards everything it produced. */
    exitDemo: function () {
      if (!this.isDemoMode) return;
      this.isDemoMode = false;
      this._endStats = null;
      this._endScreen = null;
      this._endTimer = 0;
      var inp = this.input;
      inp.up = inp.down = inp.left = inp.right = false;
      inp.fire = inp.keyFire = inp.mouseFire = false;
      inp.special = inp.keySpecial = inp.mouseSpecial = false;
      inp.touch.active = false;
      global.WaveManager.init(this.enemies, this.asteroids, this.bossMgr);
      this.enterMenu();        // clears every entity, power-up effect and the player
    },

    pause: function () {
      if (!this.isGameplay() || this.isDemoMode) return;
      this.pausedFrom = this.state;
      this.state = S.PAUSED;
      this.input.fire = this.input.keyFire = this.input.mouseFire = false;
      global.UIManager.show('pause');
      this.audio.music.setPaused(true);
      this._setCursor(false);
    },

    resume: function () {
      if (this.state !== S.PAUSED) return;
      this.state = this.pausedFrom;
      global.UIManager.hideAll();
      this.audio.music.setPaused(false);
      this._setCursor(true);
    },

    _finalizeRun: function () {
      // the demo never writes high scores, best wave or Top 3 entries
      if (this.isDemoMode) { this._endStats = null; return; }
      var p = this.player;
      var record = p.score > this.save.highScore;
      if (record) this.save.highScore = p.score;
      if (this.stats.maxWave > this.save.bestWave) this.save.bestWave = this.stats.maxWave;
      safeSet(SAVE_KEY, this.save);
      // Top 3: same run id -> a later call only raises this run's entry
      var res = global.Leaderboard.submit(this.runId, this.callsign, p.score, this.stats.maxWave);
      this.runRecordedId = this.runId;
      this._endStats = {
        score: p.score, wave: this.stats.maxWave,
        kills: this.stats.enemiesDefeated, newRecord: record,
        name: this.callsign, result: res
      };
    },

    gameOver: function () {
      if (this.state === S.GAME_OVER) return;
      var p = this.player;
      this.particles.emitExplosion(p.x, p.y, { count: 60, color: '#00f0ff', size: 30 });
      this.particles.emitExplosion(p.x, p.y, { count: 30, color: '#ffffff', size: 16 });
      // the Game Over track replaces the old synthesised jingle
      this.audio.music.play('gameover', { restart: true, fadeOut: 0.35, fadeIn: 0.2 });
      if (!this.isDemoMode && global.GamepadInput) global.GamepadInput.rumble(1, 1, 600);
      this.addShake(18);
      this.state = S.GAME_OVER;
      this._endTimer = 1.4;
      this._endScreen = 'gameover';
      if (this.isDemoMode) { this._endScreen = 'demo'; this._endTimer = 1.8; }
      this.input.fire = this.input.keyFire = this.input.mouseFire = false;
      this._finalizeRun();
      this._setCursor(false);
    },

    victory: function () {
      if (this.state === S.VICTORY) return;
      this.audio.play('victory');
      this.state = S.VICTORY;
      this._endTimer = 1.4;
      this._endScreen = this.isDemoMode ? 'demo' : 'victory';
      this._finalizeRun();
      this._setCursor(false);
    },

    continueEndless: function () {
      if (this.state !== S.VICTORY) return;
      global.WaveManager.endless = true;
      this.state = S.PLAYING;
      global.UIManager.hideAll();
      this._setCursor(true);
      global.WaveManager.nextWave();
    },

    /* ═════════════════════════════ gameplay events ═════════════════════════════ */

    // Runs right before WaveManager spawns a wave: the boss gets slightly
    // tougher for every upgrade the ship carries (+4% each, max +40%).
    beforeWaveStart: function (n) {
      var D = DIFF[this.settings.difficulty];
      var bonus = Math.min(0.4, this.player.totalUpgrades() * 0.04);
      this.bossMgr.difficulty = { health: D.enemyHealth * (1 + bonus), speed: 1 };
      void n;
    },

    onWaveStart: function (n) {
      if (n > this.stats.maxWave) this.stats.maxWave = n;
      if (n !== global.WaveManager.bossWave) this.audio.play('waveStart');
      this._ambientTimer = 6;
    },

    onBossWave: function () {
      this.state = S.BOSS;
      this.audio.play('bossAppear');
      this.audio.music.play('boss', { restart: true, fadeOut: 1.0, fadeIn: 0.5 });
      this.addShake(6);
    },

    onWaveComplete: function (wave) {
      var WM = global.WaveManager;
      this.waveBonus = 500 * wave;
      this.player.score += this.waveBonus;
      this.audio.play('waveClear');
      this.addFloater(this.width / 2, this.height * 0.4, '+' + this.waveBonus, '#00f0ff', 22);

      // the debris field dissipates when a wave ends
      var list = this.asteroids.asteroids;
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.isActive) this.particles.emit(a.x, a.y, { count: 10, color: '#aab4c8', size: 8, spread: 1.6 });
      }
      this.asteroids.clear();

      if (wave === WM.bossWave) this.state = S.PLAYING;
      this.dropPowerUp(this.width / 2 - 45, this.height * 0.35, true);
      this.dropUpgrade(this.width / 2 + 45, this.height * 0.35);
      if (wave >= WM.maxWaves && !WM.endless) this.victory();
    },

    onEnemyKilled: function (e) {
      this.stats.enemiesDefeated++;
      global.WaveManager.enemiesDefeated++;
      this.addShake(e.type === 'hunter' || e.type === 'striker' ? 3 : 1.5);
      if (e.rammed) return; // kamikaze collision: no score, no loot
      var pts = Math.round(e.scoreValue * this.player.multiplier);
      this.addFloater(e.x, e.y - 10, '+' + pts, '#ffd9a0', 13);
      var chance = (e.type === 'hunter' || e.type === 'striker') ? 0.22 : 0.07;
      if (this.player.health < 40) chance += 0.08;
      if (Math.random() < chance) this.dropPowerUp(e.x, e.y, false);
      else if ((e.type === 'hunter' || e.type === 'striker') && Math.random() < 0.045) this.dropUpgrade(e.x, e.y);
    },

    onAsteroidDestroyed: function (a) {
      this.stats.asteroidsDestroyed++;
      this.addFloater(a.x, a.y - 8, '+' + Math.round(a.scoreValue * this.player.multiplier), '#cfd6e6', 12);
      if (a.size === 'large' && Math.random() < 0.15) this.dropPowerUp(a.x, a.y, false);
    },

    onBossPhase: function (n) {
      var colors = { 2: '#ff4dc8', 3: '#ff3a3a' };
      this.showBanner(n === 3 ? 'FASE 3 - FÚRIA' : 'FASE ' + n, colors[n] || '#ffffff', 2.2);
      this.addShake(12);
    },

    onBossDying: function () {
      // minions and boss bullets die with the boss
      var list = this.enemies.enemies, i;
      for (i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.active) continue;
        e.rammed = true;
        e.takeDamage(99999);
        this.particles.emitExplosion(e.x, e.y, { count: 10, color: e.explosionColor, size: e.radius });
      }
      var pl = this.projectiles.projectiles;
      for (i = 0; i < pl.length; i++) {
        if (pl[i].type === 'boss' && pl[i].active) {
          pl[i].active = false;
          this.particles.emit(pl[i].x, pl[i].y, { count: 4, color: '#cc00ff', size: 4 });
        }
      }
      this.addShake(14);
    },

    onBossDefeated: function (b) {
      this.showBanner('ENCOURAÇADO DESTRUÍDO', '#ffffff', 3);
      this.dropPowerUp(b.x - 70, b.y, true);
      this.dropUpgrade(b.x - 20, b.y + 30);
      this.dropUpgrade(b.x + 30, b.y + 30);
      this.dropPowerUp(b.x + 80, b.y, true);
      // back to the regular soundtrack
      if (this.isGameplay()) this.audio.music.play('gaming', { restart: true, fadeOut: 1.2, fadeIn: 0.8 });
    },

    dropUpgrade: function (x, y) {
      var cx = Math.max(30, Math.min(this.width - 30, x));
      var cy = Math.max(30, Math.min(this.height - 30, y));
      this.powerups.spawn(cx, cy, 'UPGRADE');
    },

    /* ── permanent upgrades ── */

    onUpgrade: function (key, lvl, max, tierUp) {
      var p = this.player;
      if (!key) {
        this.notify({ title: 'NAVE NO MÁXIMO', name: 'CASCO REPARADO', desc: '+20 de vida', color: '#ff4488', lvl: 0, max: 0 });
        this.audio.play('powerUp');
        return;
      }
      var U = global.SHIP_UPGRADES[key];
      this.notify({ title: 'MELHORIA ADQUIRIDA', name: U.label, desc: U.desc(lvl), color: U.color, lvl: lvl, max: max });
      this.audio.play('upgrade');
      this.particles.emitCollect(p.x, p.y, { color: U.color, count: 20, spread: 3 });
      this.addFloater(p.x, p.y - 34, U.label + ' ' + lvl + '/' + max, U.color, 14);
      if (tierUp) {
        var T = global.Ships.tierStyle(p.ship, p.weaponTier);
        this.notify({ big: true, title: 'ARMA EVOLUÍDA', name: 'NÍVEL ' + p.weaponTier + ' · ' + T.name, desc: '', color: T.color, lvl: p.weaponTier, max: 5 });
        this.particles.emitShockwave(p.x, p.y, 70, T.color);
        this.addShake(6);
        this.audio.play('tierUp');
      }
    },

    notify: function (n) {
      n.t = 0;
      n.dur = n.big ? 3.0 : 2.6;
      if (this.notices.length > 4) this.notices.shift();
      this.notices.push(n);
    },

    _updateNotices: function (dt) {
      if (!this.notices.length) return;
      var n = this.notices[0];
      // move faster through the queue when several are waiting
      n.t += dt * (this.notices.length > 2 ? 1.8 : 1);
      if (n.t >= n.dur) this.notices.shift();
    },

    /* ── special weapon: shockwave around the ship ── */

    fireSpecial: function (lvl) {
      var p = this.player;
      var radius = lvl >= 2 ? 270 : 230;
      var dmg = lvl >= 2 ? 60 : 45;
      var r2 = radius * radius;
      var col = '#c58cff';
      var i, dx, dy;
      this.particles.emitShockwave(p.x, p.y, radius, col);
      this.audio.play('special');
      this.addShake(10);
      if (!this.isDemoMode && global.GamepadInput) global.GamepadInput.rumble(0.9, 0.6, 320);

      // a fake piercing "projectile" lets CollisionManager handle score, combo and loot
      var fake = { x: 0, y: 0, vx: 0, vy: 0, _angle: 0, damage: dmg, piercing: true, active: true, tier: 5, owner: 'player' };
      var en = this.enemies.enemies;
      for (i = 0; i < en.length; i++) {
        var e = en[i];
        if (!e.active) continue;
        dx = e.x - p.x; dy = e.y - p.y;
        if (dx * dx + dy * dy > r2) continue;
        fake.x = e.x; fake.y = e.y; fake._angle = Math.atan2(dy, dx); fake.active = true;
        this.collisions.handlePlayerProjectileVsEnemy(fake, e, p, this.particles, this.audio);
      }
      var as = this.asteroids.asteroids;
      for (i = 0; i < as.length; i++) {
        var a = as[i];
        if (!a.active) continue;
        dx = a.x - p.x; dy = a.y - p.y;
        if (dx * dx + dy * dy > r2) continue;
        fake.x = a.x; fake.y = a.y; fake._angle = Math.atan2(dy, dx); fake.active = true;
        this.collisions.handlePlayerProjectileVsAsteroid(fake, a, p, this.particles, this.audio);
      }
      var b = this.bossMgr.boss;
      if (b && b.active && !b.defeated) {
        dx = b.x - p.x; dy = b.y - p.y;
        var rr = radius + b.radius;
        if (dx * dx + dy * dy <= rr * rr) {
          // bosses only take half: the special must never trivialise the fight
          fake.x = b.x; fake.y = b.y; fake._angle = Math.atan2(dy, dx); fake.active = true; fake.damage = dmg * 0.5;
          this.collisions.handlePlayerProjectileVsBoss(fake, b, p, this.particles, this.audio);
        }
      }
      // erase hostile bullets inside the blast
      var pl = this.projectiles.projectiles;
      for (i = 0; i < pl.length; i++) {
        var q = pl[i];
        if (!q.active || q.type === 'player') continue;
        dx = q.x - p.x; dy = q.y - p.y;
        if (dx * dx + dy * dy <= r2) {
          q.active = false;
          this.particles.emit(q.x, q.y, { count: 3, color: col, size: 3 });
        }
      }
    },


    dropPowerUp: function (x, y, guaranteed) {
      var p = this.player;
      var types = ['SHIELD', 'RAPID_FIRE', 'MULTI_SHOT', 'SPEED_BOOST', 'REPAIR'];
      // REPAIR becomes more likely the more damaged the hull is
      var w = [1, 1.2, 1, 0.8, 0.25 + (1 - p.health / p.maxHealth) * 2.2];
      var total = 0, i;
      for (i = 0; i < w.length; i++) total += w[i];
      var roll = Math.random() * total, pick = types[0];
      for (i = 0; i < w.length; i++) {
        roll -= w[i];
        if (roll <= 0) { pick = types[i]; break; }
      }
      var cx = Math.max(30, Math.min(this.width - 30, x));
      var cy = Math.max(30, Math.min(this.height - 30, y));
      this.powerups.spawn(cx, cy, pick);
      void guaranteed;
    },

    addShake: function (m) {
      if (this.settings.shake) this.shake = Math.max(this.shake, m);
    },

    addFloater: function (x, y, txt, color, size) {
      if (this.floaters.length > 40) this.floaters.shift();
      this.floaters.push({ x: x, y: y, text: txt, color: color, size: size || 13, life: 1.1, max: 1.1 });
    },

    showBanner: function (text, color, dur) {
      this.bannerObj = { text: text, color: color, t: 0, dur: dur || 2 };
    },

    /* ═════════════════════════════ main loop ═════════════════════════════ */

    _loop: function (ts) {
      var self = this;
      global.requestAnimationFrame(function (t) { self._loop(t); });
      var dt = (ts - this._last) / 1000;
      this._last = ts;
      if (!(dt > 0)) dt = 0.016;
      if (dt > 0.05) dt = 0.05;          // clamp: a stalled tab must not teleport enemies
      this.dt = dt;
      if (global.GamepadInput) global.GamepadInput.update(dt);   // controle do Xbox
      this.update(dt);
      if (global.AttractMode) global.AttractMode.update(dt);
      this.audio.music.update();
      this.render();
    },

    update: function (dt) {
      var st = this.state;
      if (st !== S.PAUSED) {
        this.time += dt;
        this._updateBackground(dt);
        if (this.damageFlash > 0) this.damageFlash -= dt;
        if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
      }

      if (st === S.MENU) this._updateMenu(dt);
      else if (st === S.PLAYING || st === S.BOSS) this._updateGameplay(dt);
      else if (st === S.GAME_OVER || st === S.VICTORY) this._updateEnd(dt);
      // PAUSED: gameplay objects are deliberately NOT updated

      this._updateDebug();
    },

    _updateMenu: function (dt) {
      this._menuT += dt;
      var p = this.player, W = this.width, H = this.height;
      var wide = W > 900;
      p.x = (wide ? W * 0.72 : W * 0.5) + Math.sin(this._menuT * 0.6) * 18;
      p.y = (wide ? H * 0.52 : H * 0.74) + Math.sin(this._menuT * 0.9) * 12;
      p.angle = -Math.PI / 2 + Math.sin(this._menuT * 0.5) * 0.08;
      p.vx = 0;
      p.vy = -150;                       // makes the engine flame burn
      p.emitThrust(dt, this.particles);
      this.asteroids.update(dt, W, H);
      this.particles.update(dt);
    },

    _updateGameplay: function (dt) {
      var p = this.player, W = this.width, H = this.height;

      // the CPU pilot writes to its own input object; human input is untouched
      var src = this.input;
      if (this.isDemoMode && global.AttractMode) {
        global.AttractMode.ai.update(dt);
        src = global.AttractMode.ai.input;
      }
      p.update(dt, src, this);
      this.enemies.update(dt, p);
      this.bossMgr.update(dt, p);
      this.asteroids.update(dt, W, H);
      this.projectiles.update(dt, W, H);
      this.powerups.update(dt);
      global.PowerUpEffects.update(dt);
      global.WaveManager.update(dt, this.enemies, this.asteroids);
      this._spawnAmbientAsteroid(dt);

      this.collisions.checkAll(
        p, this.enemies.enemies, this.asteroids.asteroids, this.projectiles.projectiles,
        this.powerups.powerups, this.bossMgr.boss, this.particles, this.audio
      );
      this.projectiles.cleanup();        // drop inactive bullets: no leaks

      this._pullUpgrades(dt);
      if (!this.isDemoMode) this._checkLiveRank();
      this.particles.update(dt);
      this._updateFloaters(dt);
      this._updateNotices(dt);
      if (this.bannerObj) {
        this.bannerObj.t += dt;
        if (this.bannerObj.t >= this.bannerObj.dur) this.bannerObj = null;
      }

      if (!p.active) this.gameOver();
    },

    _updateEnd: function (dt) {
      this.particles.update(dt);
      this._updateFloaters(dt);
      if (this._endTimer > 0) {
        this._endTimer -= dt;
        if (this._endTimer <= 0 && this._endScreen === 'demo') {
          // demo over: no registration, no ranking — straight back to the menu
          if (global.AttractMode) global.AttractMode.finish('died');
          else this.exitDemo();
        } else if (this._endTimer <= 0 && this._endStats) {
          if (this._endScreen === 'victory') global.UIManager.showVictory(this._endStats);
          else global.UIManager.showGameOver(this._endStats);
        }
      }
    },

    // announces when the running score overtakes a pilot on the Top 3
    _checkLiveRank: function () {
      var score = this.player.score;
      if (score === this._rankScore) return;
      this._rankScore = score;
      var LB = global.Leaderboard;
      var r = LB.projectedRank(score, this.runRecordedId);
      if (!r || (this._liveRank && r >= this._liveRank)) return;
      this._liveRank = r;
      var others = [], i;
      for (i = 0; i < LB.entries.length; i++) if (LB.entries[i].id !== this.runRecordedId) others.push(LB.entries[i]);
      var passed = others[r - 1];
      if (!passed) return;                      // an empty slot is not worth a fanfare
      var col = { 1: '#ffd34d', 2: '#d9e4f2', 3: '#e0915a' }[r];
      this.notify({
        title: 'RANKING ARCADE',
        name: r === 1 ? 'VOCÊ ASSUMIU O 1º LUGAR!' : 'VOCÊ ENTROU NO TOP 3 · ' + r + 'º',
        desc: 'Superou ' + passed.name + ' · ' + String(passed.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' pts',
        color: col, lvl: 0, max: 0
      });
      this.audio.play(r === 1 ? 'tierUp' : 'specialReady');
    },

    // upgrade cores drift toward the ship when it gets close
    _pullUpgrades: function (dt) {
      var p = this.player, list = this.powerups.powerups;
      for (var i = 0; i < list.length; i++) {
        var u = list[i];
        if (u.type !== 'UPGRADE' || !u.active) continue;
        var dx = p.x - u.x, dy = p.y - u.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 150 && d > 1) {
          var sp = (1 - d / 150) * 320 * dt;
          u.x += dx / d * sp;
          u.y += dy / d * sp;
        }
      }
    },

    _spawnAmbientAsteroid: function (dt) {
      if (this.state !== S.PLAYING) return;
      this._ambientTimer -= dt;
      if (this._ambientTimer <= 0) {
        this._ambientTimer = rand(9, 14);
        if (this.asteroids.getActiveCount() < 5) this.asteroids.spawnRandom(this.width, this.height);
      }
    },

    _updateFloaters: function (dt) {
      for (var i = this.floaters.length - 1; i >= 0; i--) {
        var f = this.floaters[i];
        f.life -= dt;
        f.y -= 38 * dt;
        if (f.life <= 0) this.floaters.splice(i, 1);
      }
    },

    /* ═════════════════════════════ ENGINE INSIGHT feed ═════════════════════════════ */

    _updateDebug: function () {
      var D = global.DebugManager;
      if (!D) return;
      var need = D.isVisible || D.isCanvasDebugVisible;
      var list = this._dbgList;
      if (need) {
        list.length = 0;
        var en = this.enemies.enemies, i;
        for (i = 0; i < en.length; i++) if (en[i].active) list.push(en[i]);
        var b = this.bossMgr.boss;
        if (b && !b.finished) list.push(b);
      }
      var gs = this._dbg;
      gs.state = this.state;
      gs.wave = global.WaveManager.currentWave;
      gs.enemies = list;
      gs.projectiles = this.projectiles.projectiles;
      gs.asteroids = this.asteroids.asteroids;
      gs.particles = this.particles.particles;
      gs.powerups = this.powerups.powerups;
      gs.player = this.player;
      D.update(gs);
    },

    /* ═════════════════════════════ background ═════════════════════════════ */

    _buildBackground: function () {
      var W = this.width, H = this.height;
      var density = Math.max(0.5, (W * H) / (1280 * 720));
      var cfg = [
        { n: 70, v: 10, s: 1.0, a: 0.5,  par: 0.012 },
        { n: 40, v: 26, s: 1.5, a: 0.75, par: 0.03 },
        { n: 22, v: 58, s: 2.2, a: 0.95, par: 0.06 }
      ];
      var palette = [COLORS.STAR_WHITE, COLORS.STAR_BLUE, COLORS.STAR_YELLOW, COLORS.STAR_ORANGE, COLORS.STAR_WHITE];
      this._layers = [];
      for (var l = 0; l < cfg.length; l++) {
        var layer = { v: cfg[l].v, a: cfg[l].a, par: cfg[l].par, stars: [] };
        var n = Math.floor(cfg[l].n * density);
        for (var i = 0; i < n; i++) {
          layer.stars.push({
            x: Math.random() * W, y: Math.random() * H,
            s: cfg[l].s * rand(0.7, 1.3),
            c: palette[Math.floor(Math.random() * palette.length)],
            tw: Math.random() * 6.28
          });
        }
        this._layers.push(layer);
      }

      // nebulae are pre-rendered once into an off-screen canvas
      var nw = Math.ceil(W * 1.3), nh = Math.ceil(H * 1.3);
      var neb = document.createElement('canvas');
      neb.width = nw;
      neb.height = nh;
      var c = neb.getContext('2d');
      if (c) {
        var bg = c.createLinearGradient(0, 0, 0, nh);
        bg.addColorStop(0, COLORS.BG_DEEPSPACE);
        bg.addColorStop(1, COLORS.BG_SPACE);
        c.fillStyle = bg;
        c.fillRect(0, 0, nw, nh);
        var m = Math.min(nw, nh);
        var blob = function (fx, fy, r, rgb, a) {
          var g = c.createRadialGradient(nw * fx, nh * fy, 0, nw * fx, nh * fy, r);
          g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
          g.addColorStop(1, 'rgba(' + rgb + ',0)');
          c.fillStyle = g;
          c.fillRect(0, 0, nw, nh);
        };
        blob(0.28, 0.32, m * 0.62, '15,45,110', 0.5);
        blob(0.74, 0.62, m * 0.55, '55,25,105', 0.42);
        blob(0.5, 0.9, m * 0.5, '0,95,130', 0.2);
        blob(0.9, 0.12, m * 0.4, '20,60,140', 0.3);
      }
      this._nebula = neb;
    },

    _updateBackground: function (dt) {
      var mult = this.state === S.MENU ? 0.6 : 1;
      var W = this.width, H = this.height;
      for (var l = 0; l < this._layers.length; l++) {
        var layer = this._layers[l], st = layer.stars;
        for (var i = 0; i < st.length; i++) {
          var s = st[i];
          s.y += layer.v * mult * dt;
          if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
        }
      }
    },

    _drawBackground: function (ctx) {
      var W = this.width, H = this.height;
      var px = this.player ? this.player.x - W / 2 : 0;
      var py = this.player ? this.player.y - H / 2 : 0;
      var neb = this._nebula;
      if (neb && neb.width) {
        ctx.drawImage(neb, -(neb.width - W) / 2 - px * 0.04, -(neb.height - H) / 2 - py * 0.03);
      } else {
        ctx.fillStyle = COLORS.BG_DEEPSPACE;
        ctx.fillRect(0, 0, W, H);
      }
      for (var l = 0; l < this._layers.length; l++) {
        var layer = this._layers[l], st = layer.stars, off = -px * layer.par;
        ctx.globalAlpha = layer.a;
        for (var i = 0; i < st.length; i++) {
          var s = st[i];
          var x = ((s.x + off) % W + W) % W;
          ctx.fillStyle = s.c;
          ctx.globalAlpha = layer.a * (0.72 + 0.28 * Math.sin(this.time * 2 + s.tw));
          ctx.fillRect(x, s.y, s.s, s.s);
        }
      }
      ctx.globalAlpha = 1;
    },

    /* ═════════════════════════════ render ═════════════════════════════ */

    _drawFloaters: function (ctx) {
      if (!this.floaters.length) return;
      ctx.save();
      ctx.textAlign = 'center';
      for (var i = 0; i < this.floaters.length; i++) {
        var f = this.floaters[i];
        ctx.globalAlpha = Math.max(0, f.life / f.max);
        ctx.font = '700 ' + f.size + 'px "Courier New",monospace';
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    },

    render: function () {
      var ctx = this.ctx, W = this.width, H = this.height, st = this.state;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._drawBackground(ctx);

      ctx.save();
      if (this.shake > 0.3) {
        ctx.translate((Math.random() - 0.5) * this.shake * 1.6, (Math.random() - 0.5) * this.shake * 1.6);
      }
      this.asteroids.draw(ctx);
      if (st !== S.MENU) {
        this.powerups.draw(ctx);
        this.enemies.draw(ctx);
        this.bossMgr.draw(ctx);
        this.projectiles.draw(ctx);
      }
      this.player.draw(ctx, this.time);
      this.particles.draw(ctx);
      this._drawFloaters(ctx);

      var D = global.DebugManager;
      if (D && D.isCanvasDebugVisible && st !== S.MENU) {
        D.drawCanvasOverlay(ctx, this._dbgList, this.asteroids.asteroids, this.projectiles.projectiles, this.player);
      }
      ctx.restore();

      if (st === S.PLAYING || st === S.BOSS || st === S.PAUSED) {
        global.UIManager.drawHUD(ctx, this);
      } else if (st === S.MENU) {
        if (global.UIManager.current === 'ships') global.UIManager.drawShipPreview(this.dt || 0.016);
        var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }
    }
  };

  global.Game = Game;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Game.init(); });
  } else {
    Game.init();
  }
}(typeof window !== 'undefined' ? window : this));
