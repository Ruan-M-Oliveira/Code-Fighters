(function (global) {
  'use strict';

  // ─────────────────────────────────────────────
  //  GAME STATES
  // ─────────────────────────────────────────────
  var GAME_STATES = Object.freeze({
    MENU:      'MENU',
    PLAYING:   'PLAYING',
    PAUSED:    'PAUSED',
    BOSS:      'BOSS',
    GAME_OVER: 'GAME_OVER',
    VICTORY:   'VICTORY'
  });

  // ─────────────────────────────────────────────
  //  COLOR PALETTE
  // ─────────────────────────────────────────────
  var COLORS = Object.freeze({
    // Deep space blues
    BG_DEEPSPACE:   '#020814',
    BG_SPACE:       '#040d20',
    SPACE_DARK:     '#071028',
    SPACE_MID:      '#0a1a3a',
    SPACE_LIGHT:    '#0d2050',
    NEBULA_BLUE:    '#0f2d6e',
    NEBULA_PURPLE:  '#1a1040',
    STAR_DIM:       '#1e3a5f',

    // Cyan / teal (player, UI accents, pickups)
    CYAN:           '#00f0ff',
    CYAN_BRIGHT:    '#40ffff',
    CYAN_DIM:       '#00a0aa',
    CYAN_GLOW:      'rgba(0,240,255,0.35)',
    TEAL:           '#00c8b4',
    TEAL_DARK:      '#008070',

    // Orange / amber (warnings, explosions, enemy bullets)
    ORANGE:         '#ff7800',
    ORANGE_BRIGHT:  '#ffaa00',
    ORANGE_DIM:     '#c05000',
    AMBER:          '#ffcc00',
    AMBER_DIM:      '#a08000',
    ORANGE_GLOW:    'rgba(255,120,0,0.4)',

    // Red (danger, boss, critical health)
    RED:            '#ff1a1a',
    RED_BRIGHT:     '#ff5555',
    RED_DIM:        '#990000',
    RED_GLOW:       'rgba(255,26,26,0.4)',
    CRIMSON:        '#c0001a',

    // Neutral / UI
    WHITE:          '#ffffff',
    WHITE_DIM:      'rgba(255,255,255,0.7)',
    GREY_LIGHT:     '#8899bb',
    GREY_MID:       '#445577',
    GREY_DARK:      '#1e2a3a',
    BLACK:          '#000000',
    HUD_TEXT:       '#c8e0ff',
    HUD_BORDER:     '#1a3a6a',

    // Health / shield
    HEALTH_FULL:    '#00ff88',
    HEALTH_MID:     '#ffcc00',
    HEALTH_LOW:     '#ff2200',
    SHIELD:         '#44aaff',
    SHIELD_GLOW:    'rgba(68,170,255,0.4)',

    // Stars
    STAR_WHITE:     '#ffffff',
    STAR_BLUE:      '#aaccff',
    STAR_YELLOW:    '#ffffaa',
    STAR_ORANGE:    '#ffcc88'
  });

  // ─────────────────────────────────────────────
  //  MATH UTILITIES
  // ─────────────────────────────────────────────

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function distance(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function normalizeVector(x, y) {
    var len = Math.sqrt(x * x + y * y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function randomChoice(array) {
    if (!array || array.length === 0) return undefined;
    return array[Math.floor(Math.random() * array.length)];
  }

  function angleBetween(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  function degToRad(deg) {
    return deg * (Math.PI / 180);
  }

  function radToDeg(rad) {
    return rad * (180 / Math.PI);
  }

  function vectorFromAngle(angle, speed) {
    return {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed
    };
  }

  // ─────────────────────────────────────────────
  //  OBJECT POOL
  // ─────────────────────────────────────────────

  function Pool(createFn, resetFn, initialSize) {
    this._createFn = createFn;
    this._resetFn  = resetFn  || function (obj) { return obj; };
    this._pool     = [];
    this.active    = [];

    initialSize = initialSize || 0;
    for (var i = 0; i < initialSize; i++) {
      this._pool.push(this._createFn());
    }
  }

  Pool.prototype.get = function () {
    var obj;
    if (this._pool.length > 0) {
      obj = this._pool.pop();
    } else {
      obj = this._createFn();
    }
    this._resetFn(obj);
    this.active.push(obj);
    return obj;
  };

  Pool.prototype.release = function (obj) {
    var idx = this.active.indexOf(obj);
    if (idx !== -1) {
      this.active.splice(idx, 1);
      this._pool.push(obj);
    }
  };

  Pool.prototype.releaseAll = function () {
    while (this.active.length > 0) {
      this._pool.push(this.active.pop());
    }
  };

  Pool.prototype.forEachActive = function (fn) {
    // iterate in reverse so releasing inside loop is safe
    for (var i = this.active.length - 1; i >= 0; i--) {
      fn(this.active[i], i);
    }
  };

  Pool.prototype.size = function () {
    return this.active.length;
  };

  Pool.prototype.available = function () {
    return this._pool.length;
  };

  // ─────────────────────────────────────────────
  //  EVENT EMITTER
  // ─────────────────────────────────────────────

  function EventEmitter() {
    this._listeners = {};
  }

  EventEmitter.prototype.on = function (event, callback, context) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push({ fn: callback, ctx: context || null });
    return this;
  };

  EventEmitter.prototype.once = function (event, callback, context) {
    var self = this;
    function wrapper() {
      callback.apply(context || null, arguments);
      self.off(event, wrapper);
    }
    wrapper._original = callback;
    return this.on(event, wrapper, context);
  };

  EventEmitter.prototype.off = function (event, callback) {
    if (!this._listeners[event]) return this;
    if (!callback) {
      this._listeners[event] = [];
      return this;
    }
    var list = this._listeners[event];
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].fn === callback || list[i].fn._original === callback) {
        list.splice(i, 1);
      }
    }
    return this;
  };

  EventEmitter.prototype.emit = function (event) {
    if (!this._listeners[event]) return this;
    var args = Array.prototype.slice.call(arguments, 1);
    var list = this._listeners[event].slice(); // copy so removes mid-loop are safe
    for (var i = 0; i < list.length; i++) {
      list[i].fn.apply(list[i].ctx, args);
    }
    return this;
  };

  EventEmitter.prototype.removeAllListeners = function (event) {
    if (event) {
      this._listeners[event] = [];
    } else {
      this._listeners = {};
    }
    return this;
  };

  // ─────────────────────────────────────────────
  //  TIMER
  // ─────────────────────────────────────────────

  function Timer(duration) {
    this.duration  = duration || 0;
    this._elapsed  = 0;
    this._done     = false;
    this._running  = true;
  }

  Timer.prototype.update = function (dt) {
    if (!this._running || this._done) return;
    this._elapsed += dt;
    if (this._elapsed >= this.duration) {
      this._elapsed = this.duration;
      this._done    = true;
    }
  };

  Timer.prototype.isDone = function () {
    return this._done;
  };

  Timer.prototype.reset = function (newDuration) {
    this._elapsed = 0;
    this._done    = false;
    this._running = true;
    if (newDuration !== undefined) {
      this.duration = newDuration;
    }
  };

  Timer.prototype.pause = function () {
    this._running = false;
  };

  Timer.prototype.resume = function () {
    this._running = true;
  };

  Timer.prototype.progress = function () {
    if (this.duration === 0) return 1;
    return clamp(this._elapsed / this.duration, 0, 1);
  };

  Timer.prototype.remaining = function () {
    return Math.max(0, this.duration - this._elapsed);
  };

  // ─────────────────────────────────────────────
  //  FORMAT SCORE
  // ─────────────────────────────────────────────

  function formatScore(n) {
    n = Math.floor(n) || 0;
    // pad to 8 digits then insert commas
    var padded = String(n).padStart(8, '0');
    // insert commas every 3 digits from the right
    return padded.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ─────────────────────────────────────────────
  //  GENERATE ID
  // ─────────────────────────────────────────────

  var _idCounter = 0;

  function generateId() {
    _idCounter += 1;
    var ts   = Date.now().toString(36);
    var rand = Math.random().toString(36).substr(2, 6);
    return 'sf_' + ts + '_' + rand + '_' + _idCounter;
  }

  // ─────────────────────────────────────────────
  //  ADDITIONAL HELPERS
  // ─────────────────────────────────────────────

  function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  function circlesOverlap(x1, y1, r1, x2, y2, r2) {
    var d = distance(x1, y1, x2, y2);
    return d < (r1 + r2);
  }

  function wrap(val, min, max) {
    var range = max - min;
    if (range === 0) return min;
    return ((val - min) % range + range) % range + min;
  }

  function smoothStep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 2);
  }

  function easeIn(t) {
    return t * t;
  }

  function hexToRgba(hex, alpha) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return 'rgba(0,0,0,' + (alpha !== undefined ? alpha : 1) + ')';
    var r = parseInt(result[1], 16);
    var g = parseInt(result[2], 16);
    var b = parseInt(result[3], 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha !== undefined ? alpha : 1) + ')';
  }

  function shuffleArray(array) {
    var arr = array.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // ─────────────────────────────────────────────
  //  NAMESPACE EXPORT
  // ─────────────────────────────────────────────

  var Utils = {
    // Constants
    GAME_STATES: GAME_STATES,
    COLORS:      COLORS,

    // Math
    lerp:            lerp,
    clamp:           clamp,
    distance:        distance,
    normalizeVector: normalizeVector,
    randomBetween:   randomBetween,
    randomInt:       randomInt,
    randomChoice:    randomChoice,
    angleBetween:    angleBetween,
    degToRad:        degToRad,
    radToDeg:        radToDeg,
    vectorFromAngle: vectorFromAngle,

    // Geometry helpers
    pointInRect:    pointInRect,
    circlesOverlap: circlesOverlap,
    wrap:           wrap,

    // Easing
    smoothStep: smoothStep,
    easeInOut:  easeInOut,
    easeOut:    easeOut,
    easeIn:     easeIn,

    // Color
    hexToRgba: hexToRgba,

    // Array
    shuffleArray: shuffleArray,

    // String / ID
    formatScore: formatScore,
    formatTime:  formatTime,
    generateId:  generateId,

    // Classes
    Pool:         Pool,
    EventEmitter: EventEmitter,
    Timer:        Timer
  };

  global.Utils = Utils;

  // Also expose top-level constants for convenience
  global.GAME_STATES = GAME_STATES;
  global.COLORS      = COLORS;

}(typeof window !== 'undefined' ? window : this));
