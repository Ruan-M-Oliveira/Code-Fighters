(function () {
  'use strict';

  var WaveManager = {
    currentWave: 0,
    isTransitioning: false,
    bossWave: 5,
    maxWaves: 10,
    enemiesDefeated: 0,
    totalEnemiesThisWave: 0,
    onWaveComplete: null,
    onBossWave: null,
    waveAnnouncement: {
      text: '',
      timer: 0,
      visible: false
    },
    _enemyManager: null,
    _asteroidManager: null,
    _bossManager: null,
    _transitionTimer: 0,
    _transitionDelay: 3.0,
    _announcementDuration: 3.0,
    _waitingForBoss: false,
    _bossDefeated: false,

    init: function (enemyManager, asteroidManager, bossManager) {
      this._enemyManager = enemyManager;
      this._asteroidManager = asteroidManager;
      this._bossManager = bossManager;
      this.currentWave = 0;
      this.isTransitioning = false;
      this.enemiesDefeated = 0;
      this.totalEnemiesThisWave = 0;
      this._transitionTimer = 0;
      this._waitingForBoss = false;
      this._bossDefeated = false;
      this.endless = false;
      this.waveAnnouncement = { text: '', timer: 0, visible: false };
    },

    getWaveConfig: function (waveNum) {
      var config = {
        scouts: 0,
        hunters: 0,
        strikers: 0,
        swarm: 0,
        boss: false,
        asteroids: 0,
        speedMultiplier: 1.0,
        healthMultiplier: 1.0
      };

      if (waveNum === 1) {
        config.scouts = 5;
        config.asteroids = 0;
        config.speedMultiplier = 1.0;
        config.healthMultiplier = 1.0;
      } else if (waveNum === 2) {
        config.scouts = 5;
        config.hunters = 3;
        config.asteroids = 4;
        config.speedMultiplier = 1.0;
        config.healthMultiplier = 1.0;
      } else if (waveNum === 3) {
        config.hunters = 4;
        config.strikers = 4;
        config.asteroids = 6;
        config.speedMultiplier = 1.1;
        config.healthMultiplier = 1.1;
      } else if (waveNum === 4) {
        config.scouts = 3;
        config.hunters = 3;
        config.strikers = 3;
        config.swarm = 10;
        config.asteroids = 8;
        config.speedMultiplier = 1.2;
        config.healthMultiplier = 1.2;
      } else if (waveNum === 5) {
        config.boss = true;
        config.asteroids = 5;
        config.speedMultiplier = 1.0;
        config.healthMultiplier = 1.0;
      } else {
        var extra = waveNum - 5;
        var baseCount = 2 + extra;
        config.scouts = baseCount;
        config.hunters = baseCount;
        config.strikers = Math.max(2, baseCount - 1);
        config.swarm = 5 + extra * 3;
        config.asteroids = 8 + extra * 2;
        config.speedMultiplier = 1.0 + extra * 0.1;
        config.healthMultiplier = 1.0 + extra * 0.15;
      }

      return config;
    },

    startWave: function (waveNum) {
      this.currentWave = waveNum;
      this.isTransitioning = false;
      this._transitionTimer = 0;
      this.enemiesDefeated = 0;
      this.totalEnemiesThisWave = 0;
      this._waitingForBoss = false;
      this._bossDefeated = false;

      this.displayWaveAnnouncement(waveNum);

      var config = this.getWaveConfig(waveNum);

      var cw = (this._enemyManager && this._enemyManager.canvasWidth) ? this._enemyManager.canvasWidth : 800;
      var ch = (this._enemyManager && this._enemyManager.canvasHeight) ? this._enemyManager.canvasHeight : 600;

      if (window.Game && window.Game.width) { cw = window.Game.width; ch = window.Game.height; }

      if (config.boss) {
        this._waitingForBoss = true;
        if (this._bossManager && typeof this._bossManager.spawnBoss === 'function') {
          this._bossManager.spawnBoss(cw, ch);
        }
        if (typeof this.onBossWave === 'function') {
          this.onBossWave(waveNum);
        }
        this.totalEnemiesThisWave = 1;
      } else {
        this.spawnWaveEnemies(waveNum, cw, ch);
        this.totalEnemiesThisWave =
          config.scouts + config.hunters + config.strikers + config.swarm;
      }

      if (config.asteroids > 0) {
        this.spawnWaveAsteroids(waveNum, cw, ch);
      }
    },

    spawnWaveEnemies: function (waveNum, canvasWidth, canvasHeight) {
      var config = this.getWaveConfig(waveNum);
      var em = this._enemyManager;
      if (!em) return;

      var spawnFn = null;
      if (typeof em.spawnEnemy === 'function') {
        spawnFn = function (type, x, y, speedMult, healthMult) {
          em.spawnEnemy(type, x, y, speedMult, healthMult);
        };
      } else if (typeof em.spawn === 'function') {
        spawnFn = function (type, x, y, speedMult, healthMult) {
          em.spawn(type, x, y, speedMult, healthMult);
        };
      } else {
        return;
      }

      var sm = config.speedMultiplier;
      var hm = config.healthMultiplier;
      var i, x, y;

      for (i = 0; i < config.scouts; i++) {
        x = Math.random() * (canvasWidth * 0.8) + canvasWidth * 0.1;
        y = -40 - i * 60;
        spawnFn('scout', x, y, sm, hm);
      }
      for (i = 0; i < config.hunters; i++) {
        x = Math.random() * (canvasWidth * 0.8) + canvasWidth * 0.1;
        y = -40 - i * 70;
        spawnFn('hunter', x, y, sm, hm);
      }
      for (i = 0; i < config.strikers; i++) {
        x = Math.random() * (canvasWidth * 0.8) + canvasWidth * 0.1;
        y = -40 - i * 80;
        spawnFn('striker', x, y, sm, hm);
      }
      for (i = 0; i < config.swarm; i++) {
        x = Math.random() * canvasWidth;
        y = -20 - i * 30;
        spawnFn('swarm', x, y, sm * 1.3, hm * 0.6);
      }
    },

    spawnWaveAsteroids: function (waveNum, canvasWidth, canvasHeight) {
      var config = this.getWaveConfig(waveNum);
      var am = this._asteroidManager;
      if (!am) return;

      var spawnFn = null;
      if (typeof am.spawnAsteroid === 'function') {
        spawnFn = function (x, y, size, speed) { am.spawnAsteroid(x, y, size, speed); };
      } else if (typeof am.spawn === 'function') {
        spawnFn = function (x, y, size, speed) { am.spawn(x, y, size, speed); };
      } else {
        return;
      }

      var count = config.asteroids;
      var baseSpeed = 40 + waveNum * 5;
      for (var i = 0; i < count; i++) {
        var x = Math.random() * canvasWidth;
        var y = -60 - Math.random() * 400;
        var size = 'small';
        var roll = Math.random();
        if (roll < 0.3) size = 'large';
        else if (roll < 0.6) size = 'medium';
        var speed = baseSpeed + Math.random() * 30;
        spawnFn(x, y, size, speed);
      }
    },

    displayWaveAnnouncement: function (waveNum) {
      var text;
      if (waveNum === this.bossWave) {
        text = 'ALERTA: CHEFE SE APROXIMANDO!';
      } else if (waveNum > this.maxWaves) {
        text = 'MODO INFINITO — ONDA ' + waveNum;
      } else {
        text = 'ONDA ' + waveNum;
      }
      this.waveAnnouncement.text = text;
      this.waveAnnouncement.timer = this._announcementDuration;
      this.waveAnnouncement.visible = true;
    },

    checkWaveComplete: function (enemyManager, asteroidManager, bossRef) {
      var em = enemyManager || this._enemyManager;
      var am = asteroidManager || this._asteroidManager;
      var boss = bossRef;

      if (this.isTransitioning) return false;

      if (this.currentWave === this.bossWave) {
        var bossAlive = false;
        if (boss) {
          bossAlive = boss.alive === true || boss.active === true || boss.health > 0;
        } else if (this._bossManager) {
          var bm = this._bossManager;
          if (typeof bm.isAlive === 'function') {
            bossAlive = bm.isAlive();
          } else if (bm.boss) {
            bossAlive = bm.boss.alive === true || bm.boss.active === true;
          } else {
            bossAlive = bm.alive === true || bm.active === true;
          }
        }
        if (this._waitingForBoss && !bossAlive) {
          return true;
        }
        return false;
      }

      var enemiesLeft = 0;
      if (em) {
        if (typeof em.getActiveCount === 'function') {
          enemiesLeft = em.getActiveCount();
        } else if (typeof em.count === 'function') {
          enemiesLeft = em.count();
        } else if (Array.isArray(em.enemies)) {
          enemiesLeft = em.enemies.filter(function (e) {
            return e && (e.alive === true || e.active === true);
          }).length;
        } else if (typeof em.activeEnemies !== 'undefined') {
          enemiesLeft = em.activeEnemies;
        }
      }

      var asteroidsLeft = 0;
      if (am) {
        if (typeof am.getActiveCount === 'function') {
          asteroidsLeft = am.getActiveCount();
        } else if (typeof am.count === 'function') {
          asteroidsLeft = am.count();
        } else if (Array.isArray(am.asteroids)) {
          asteroidsLeft = am.asteroids.filter(function (a) {
            return a && (a.alive === true || a.active === true);
          }).length;
        } else if (typeof am.activeAsteroids !== 'undefined') {
          asteroidsLeft = am.activeAsteroids;
        }
      }

      // Asteroids are an environmental hazard; the wave ends when every enemy is down.
      return enemiesLeft <= 0;
    },

    nextWave: function () {
      var next = this.currentWave + 1;
      this.isTransitioning = false;
      this._transitionTimer = 0;
      this.startWave(next);
    },

    update: function (dt, enemyManager, asteroidManager, bossRef) {
      var em = enemyManager || this._enemyManager;
      var am = asteroidManager || this._asteroidManager;

      if (this.waveAnnouncement.visible) {
        this.waveAnnouncement.timer -= dt;
        if (this.waveAnnouncement.timer <= 0) {
          this.waveAnnouncement.timer = 0;
          this.waveAnnouncement.visible = false;
        }
      }

      if (this.isTransitioning) {
        this._transitionTimer -= dt;
        if (this._transitionTimer <= 0) {
          this._transitionTimer = 0;
          this.isTransitioning = false;
          if (this.currentWave < this.maxWaves || this.endless) {
            this.nextWave();
          }
        }
        return;
      }

      if (this.currentWave === 0) return;

      var done = this.checkWaveComplete(em, am, bossRef);
      if (done) {
        this.isTransitioning = true;
        this._transitionTimer = this._transitionDelay;
        if (typeof this.onWaveComplete === 'function') {
          this.onWaveComplete(this.currentWave);
        }
      }
    }
  };

  var canvas = null;
  try {
    canvas = document.getElementById('gameCanvas') || document.querySelector('canvas');
  } catch (e) {}

  window.WaveManager = WaveManager;
})();
