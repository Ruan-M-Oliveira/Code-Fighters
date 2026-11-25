(function (global) {
  'use strict';

  /**
   * AudioManager — sound effects are synthesised with the Web Audio API
   * (oscillators + filtered noise); the soundtrack comes from the files in
   * /music through MusicManager (this.music).
   * The AudioContext is only created after the first user gesture.
   */
  function AudioManager() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._noise = null;
    this._last = {};
    this._ambient = null;
    this.masterVolume = 0.8;
    this.music = new MusicManager();
  }

  // Minimum gap (ms) between two plays of the same sound, so we never flood the mixer
  var MIN_GAP = {
    shoot: 45, enemyShoot: 60, hit: 40, enemyExplode: 50, asteroidHit: 50,
    asteroidDestroy: 60, playerHit: 120, powerUp: 80, bossHit: 70, menuHover: 60,
    upgrade: 200, tierUp: 400, special: 300, specialReady: 500, barrier: 150
  };

  AudioManager.prototype.init = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55 * this.masterVolume;
      this.master.connect(this.ctx.destination);
      var len = this.ctx.sampleRate;
      this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this._noise.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
  };

  AudioManager.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!this.enabled) this.stopAmbient();
    this.music.setEnabled(this.enabled);
  };

  AudioManager.prototype._tone = function (f0, f1, dur, type, vol, delay) {
    var c = this.ctx;
    var t = c.currentTime + (delay || 0);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  };

  AudioManager.prototype._noiseBurst = function (dur, vol, f0, f1, delay) {
    var c = this.ctx;
    var t = c.currentTime + (delay || 0);
    var s = c.createBufferSource();
    s.buffer = this._noise;
    var flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    s.start(t, Math.random() * 0.4);
    s.stop(t + dur + 0.03);
  };

  /** variant: weapon tier (1-5) for 'shoot'; kind: ship weapon sound (twin|heavy|spread|beam) */
  AudioManager.prototype.play = function (name, variant, kind) {
    if (!this.enabled || !this.ctx) return;
    var now = performance.now();
    var gap = MIN_GAP[name] || 25;
    if (name === 'shoot' && kind === 'beam') gap = 70;      // fast beam: keep the mixer calm
    if (this._last[name] && now - this._last[name] < gap) return;
    this._last[name] = now;

    switch (name) {
      case 'shoot':
        var tier = variant || 1;
        if (kind === 'heavy') {
          // Striker: deep plasma thump
          this._tone(240 + tier * 15, 60, 0.22, 'sawtooth', 0.07);
          this._tone(120, 40, 0.25, 'sine', 0.16);
          this._noiseBurst(0.16, 0.06 + tier * 0.01, 1800, 200);
          break;
        }
        if (kind === 'spread') {
          // Spectre: three quick chirps
          this._tone(1100 + tier * 30, 500, 0.06, 'triangle', 0.035, 0);
          this._tone(1300 + tier * 30, 600, 0.06, 'triangle', 0.03, 0.018);
          this._tone(900 + tier * 30, 420, 0.06, 'triangle', 0.03, 0.034);
          if (tier >= 3) this._noiseBurst(0.04, 0.02 + tier * 0.004, 7000, 2500);
          break;
        }
        if (kind === 'beam') {
          // Nova: soft high energy hum
          this._tone(1500 + tier * 60, 1300, 0.07, 'sine', 0.03 + tier * 0.004);
          this._tone(750 + tier * 30, 700, 0.07, 'triangle', 0.014);
          break;
        }
        // same base blip; higher tiers add a body tone and a crisp transient
        this._tone(880 + tier * 40, 260 - tier * 18, 0.09, 'square', 0.05 - tier * 0.004);
        if (tier >= 2) this._tone(520 + tier * 30, 150, 0.08, 'triangle', 0.018 + tier * 0.006);
        if (tier >= 3) this._noiseBurst(0.05, 0.02 + tier * 0.006, 6000, 1500);
        if (tier >= 5) this._tone(1760, 880, 0.06, 'sine', 0.025);
        break;
      case 'upgrade':
        var up = [523, 659, 784, 1047, 1319];
        for (var u = 0; u < up.length; u++) this._tone(up[u], up[u] * 1.003, 0.14, 'triangle', 0.11, u * 0.055);
        this._tone(2093, 2093, 0.3, 'sine', 0.05, 0.28);
        break;
      case 'tierUp':
        this._noiseBurst(0.6, 0.12, 400, 6000);
        this._tone(196, 784, 0.55, 'sawtooth', 0.07);
        var ch = [392, 494, 587, 784];
        for (var c2 = 0; c2 < ch.length; c2++) this._tone(ch[c2], ch[c2], 0.7, 'triangle', 0.08, 0.45);
        this._tone(1568, 1568, 0.5, 'sine', 0.05, 0.55);
        break;
      case 'special':
        this._tone(60, 30, 0.7, 'sine', 0.4);
        this._tone(220, 1400, 0.35, 'sawtooth', 0.06);
        this._noiseBurst(0.8, 0.32, 3000, 80);
        break;
      case 'specialReady':
        this._tone(1175, 1175, 0.08, 'sine', 0.07, 0);
        this._tone(1568, 1568, 0.16, 'sine', 0.07, 0.08);
        break;
      case 'barrier':
        this._tone(1400, 500, 0.18, 'triangle', 0.1);
        this._noiseBurst(0.15, 0.1, 5000, 1200);
        break;
      case 'enemyShoot':
        this._tone(320, 110, 0.14, 'sawtooth', 0.06);
        break;
      case 'hit':
        this._tone(240, 120, 0.06, 'triangle', 0.09);
        this._noiseBurst(0.05, 0.08, 3000, 800);
        break;
      case 'enemyExplode':
        this._noiseBurst(0.35, 0.28, 1800, 120);
        this._tone(130, 40, 0.3, 'sine', 0.22);
        break;
      case 'asteroidHit':
        this._noiseBurst(0.09, 0.12, 900, 300);
        break;
      case 'asteroidDestroy':
        this._noiseBurst(0.32, 0.26, 1000, 90);
        this._tone(90, 35, 0.3, 'sine', 0.2);
        break;
      case 'playerHit':
        this._tone(160, 45, 0.3, 'sawtooth', 0.18);
        this._noiseBurst(0.25, 0.2, 2200, 200);
        break;
      case 'powerUp':
        this._tone(440, 440, 0.09, 'sine', 0.12, 0);
        this._tone(660, 660, 0.09, 'sine', 0.12, 0.07);
        this._tone(880, 880, 0.09, 'sine', 0.12, 0.14);
        this._tone(1320, 1320, 0.16, 'sine', 0.12, 0.21);
        break;
      case 'bossHit':
        this._tone(110, 70, 0.08, 'square', 0.08);
        break;
      case 'bossPhaseChange':
        this._tone(70, 420, 0.9, 'sawtooth', 0.16);
        this._noiseBurst(0.7, 0.18, 400, 2500);
        break;
      case 'bossAppear':
        for (var i = 0; i < 4; i++) {
          this._tone(380, 380, 0.22, 'sawtooth', 0.12, i * 0.5);
          this._tone(540, 540, 0.22, 'sawtooth', 0.12, i * 0.5 + 0.25);
        }
        break;
      case 'bossExplode':
        this._noiseBurst(1.6, 0.5, 2400, 50);
        this._tone(100, 25, 1.4, 'sine', 0.4);
        break;
      case 'gameOver':
        this._tone(330, 330, 0.28, 'triangle', 0.18, 0);
        this._tone(262, 262, 0.28, 'triangle', 0.18, 0.28);
        this._tone(196, 196, 0.28, 'triangle', 0.18, 0.56);
        this._tone(147, 110, 0.9, 'triangle', 0.2, 0.84);
        break;
      case 'victory':
        var notes = [392, 494, 587, 784, 988];
        for (var n = 0; n < notes.length; n++) this._tone(notes[n], notes[n], 0.3, 'triangle', 0.16, n * 0.15);
        break;
      case 'waveStart':
        this._tone(330, 660, 0.35, 'triangle', 0.12);
        break;
      case 'waveClear':
        this._tone(523, 523, 0.12, 'sine', 0.13, 0);
        this._tone(659, 659, 0.12, 'sine', 0.13, 0.1);
        this._tone(784, 784, 0.25, 'sine', 0.13, 0.2);
        break;
      case 'menuClick':
        this._tone(620, 420, 0.07, 'square', 0.06);
        break;
      case 'menuHover':
        this._tone(900, 900, 0.03, 'sine', 0.025);
        break;
    }
  };

  /** Slow, dark space drone for the menu. */
  AudioManager.prototype.startAmbient = function () {
    if (!this.ctx || !this.enabled || this._ambient) return;
    var c = this.ctx;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.linearRampToValueAtTime(0.07, c.currentTime + 3);
    g.connect(this.master);

    var flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 420;
    flt.connect(g);

    var o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    var o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = 82.6;
    var lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    var lg = c.createGain();
    lg.gain.value = 180;
    lfo.connect(lg);
    lg.connect(flt.frequency);

    o1.connect(flt);
    o2.connect(flt);
    o1.start();
    o2.start();
    lfo.start();
    this._ambient = { gain: g, nodes: [o1, o2, lfo] };
  };

  AudioManager.prototype.stopAmbient = function () {
    if (!this._ambient || !this.ctx) { this._ambient = null; return; }
    var a = this._ambient;
    this._ambient = null;
    var t = this.ctx.currentTime;
    try {
      a.gain.gain.cancelScheduledValues(t);
      a.gain.gain.setValueAtTime(a.gain.gain.value, t);
      a.gain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
      for (var i = 0; i < a.nodes.length; i++) a.nodes[i].stop(t + 0.7);
    } catch (e) { /* already stopped */ }
  };

  /* ═════════════════════════════ MusicManager ═════════════════════════════
   * Soundtrack from the files in /music, played through <audio> elements
   * (works from file:// as well as http). One track is audible at a time:
   * the next one only starts once the previous has (almost) faded out.
   * Playback is retried after the first user gesture if autoplay is blocked. */

  var MUSIC_FILES = {
    title:    'music/Title Theme.mp3',
    gaming:   'music/Gaming.mp3',
    boss:     'music/Boss Battle.mp3',
    gameover: 'music/Game Over.mp3'
  };
  var MUSIC_LOOP = { title: true, gaming: true, boss: true, gameover: false };
  var MUSIC_GAIN = { title: 0.9, gaming: 0.75, boss: 0.8, gameover: 0.9 };

  function MusicManager() {
    this.tracks = {};
    this.wanted = null;       // track that should be audible
    this.enabled = true;
    this.master = 0.8;        // 0..1 (shared with SFX)
    this.volume = 0.7;        // 0..1 music only
    this.duck = 1;            // lowered while paused
    this._duckTarget = 1;
    this._lastTs = 0;
  }

  MusicManager.prototype._track = function (name) {
    var t = this.tracks[name];
    if (t) return t;
    if (!MUSIC_FILES[name] || typeof global.Audio !== 'function') return null;
    var el = new global.Audio();
    el.preload = 'auto';
    el.loop = !!MUSIC_LOOP[name];
    el.src = encodeURI(MUSIC_FILES[name]);
    el.volume = 0;
    t = { name: name, el: el, level: 0, target: 0, playing: false, pending: false, fade: 0.8 };
    var self = this;
    el.addEventListener('ended', function () { t.playing = false; t.level = 0; if (self.wanted === name) self.wanted = null; });
    this.tracks[name] = t;
    return t;
  };

  /** Make `name` the audible track. opts: { restart, fadeIn, fadeOut } */
  MusicManager.prototype.play = function (name, opts) {
    opts = opts || {};
    var t = this._track(name);
    if (!t) return;
    var same = this.wanted === name && t.playing;
    this.wanted = name;
    for (var k in this.tracks) {
      if (k !== name && this.tracks[k].target !== 0) {
        this.tracks[k].target = 0;
        this.tracks[k].fade = opts.fadeOut || 0.7;
      }
    }
    t.target = 1;
    t.fade = opts.fadeIn || 0.6;
    if (same) return;                           // already running: never restart on UI updates
    if (opts.restart || !t.playing) {
      try { t.el.currentTime = 0; } catch (e) { /* not loaded yet */ }
      t.level = 0;
    }
    t.pending = true;                           // starts in update() once others have faded
  };

  MusicManager.prototype.stopAll = function (fade) {
    this.wanted = null;
    for (var k in this.tracks) { this.tracks[k].target = 0; this.tracks[k].fade = fade || 0.6; }
  };

  MusicManager.prototype._start = function (t) {
    var self = this;
    t.pending = false;
    t.playing = true;
    var pr;
    try { pr = t.el.play(); } catch (e) { t.playing = false; t.pending = true; return; }
    if (pr && typeof pr.catch === 'function') {
      pr.catch(function (err) {
        // autoplay blocked: retry on the next user gesture
        t.playing = false;
        if (self.wanted === t.name) {
          t.pending = true;
          if (!err || err.name === 'NotAllowedError') self._blocked = true;
        }
      });
    }
  };

  /** Called on user gestures: retries a track the browser refused to start. */
  MusicManager.prototype.unlock = function () {
    this._blocked = false;
    var t = this.wanted && this.tracks[this.wanted];
    if (t && this.enabled && !t.playing) this._start(t);
  };

  MusicManager.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    for (var k in this.tracks) {
      var t = this.tracks[k];
      if (!this.enabled && t.playing) { t.el.pause(); t.playing = false; t.pending = k === this.wanted; }
    }
    if (this.enabled) this.unlock();
  };

  MusicManager.prototype.setPaused = function (paused) {
    this._duckTarget = paused ? 0.35 : 1;
  };

  MusicManager.prototype.update = function () {
    var now = performance.now();
    var dt = this._lastTs ? Math.min(0.1, (now - this._lastTs) / 1000) : 0.016;
    this._lastTs = now;
    this.duck += (this._duckTarget - this.duck) * Math.min(1, dt * 4);
    var others = 0, k, t;
    for (k in this.tracks) {
      t = this.tracks[k];
      if (k !== this.wanted && t.playing) others = Math.max(others, t.level);
    }
    for (k in this.tracks) {
      t = this.tracks[k];
      if (t.pending && this.enabled && !this._blocked && others < 0.12) this._start(t);
      if (!t.playing) continue;
      var step = dt / Math.max(0.05, t.fade);
      if (t.level < t.target) t.level = Math.min(t.target, t.level + step);
      else if (t.level > t.target) t.level = Math.max(t.target, t.level - step);
      if (t.target === 0 && t.level <= 0) {
        t.el.pause();
        t.playing = false;
        continue;
      }
      var v = t.level * t.level * this.volume * this.master * this.duck * (MUSIC_GAIN[k] || 1);
      t.el.volume = Math.max(0, Math.min(1, v));
    }
  };

  AudioManager.prototype.setMasterVolume = function (v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = 0.55 * this.masterVolume;
    this.music.master = this.masterVolume;
  };

  AudioManager.prototype.setMusicVolume = function (v) {
    this.music.volume = Math.max(0, Math.min(1, v));
  };

  global.MusicManager = MusicManager;
  global.AudioManager = AudioManager;
}(typeof window !== 'undefined' ? window : this));
