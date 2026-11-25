(function (global) {
  'use strict';

  var DebugManager = {
    isVisible: false,
    isCanvasDebugVisible: false,

    _panel: null,
    _toggleBtn: null,
    _collisionLog: [],
    _maxCollisionLog: 5,
    _frameTimes: [],
    _maxFrameSamples: 60,
    _lastFrameTime: performance.now(),
    _fps: 0,
    _frameTime: 0,

    _sections: {},

    init: function () {
      this._createPanel();
      this._createToggleButton();
      this._attachKeyListener();
    },

    _createPanel: function () {
      var panel = document.createElement('div');
      panel.id = 'debug-panel';
      panel.style.cssText = [
        'position:fixed',
        'top:0',
        'right:0',
        'width:300px',
        'max-height:100vh',
        'overflow-y:auto',
        'background:#000000cc',
        'color:#00ffff',
        'font-family:monospace',
        'font-size:11px',
        'line-height:1.5',
        'padding:8px 10px',
        'z-index:99999',
        'box-sizing:border-box',
        'border-left:1px solid #00ffff44',
        'display:none',
        'pointer-events:auto'
      ].join(';');

      var title = document.createElement('div');
      title.style.cssText = 'color:#ffffff;font-weight:bold;font-size:13px;border-bottom:1px solid #00ffff88;padding-bottom:4px;margin-bottom:6px;letter-spacing:1px;';
      title.textContent = '⚙ PAINEL DO MOTOR [F3]';
      panel.appendChild(title);

      var sectionDefs = [
        { key: 'perf',       label: '── DESEMPENHO' },
        { key: 'entities',   label: '── ENTIDADES' },
        { key: 'gamestate',  label: '── ESTADO DO JOGO' },
        { key: 'player',     label: '── JOGADOR' },
        { key: 'ai',         label: '── COMPORTAMENTO DA IA' },
        { key: 'collisions', label: '── COLISÕES (últimas 5)' },
        { key: 'memory',     label: '── MEMÓRIA' }
      ];

      for (var i = 0; i < sectionDefs.length; i++) {
        var def = sectionDefs[i];

        var header = document.createElement('div');
        header.style.cssText = 'color:#ffff00;font-size:10px;margin-top:7px;margin-bottom:2px;letter-spacing:0.5px;';
        header.textContent = def.label;
        panel.appendChild(header);

        var body = document.createElement('div');
        body.id = 'dbg-section-' + def.key;
        body.style.cssText = 'padding-left:6px;';
        panel.appendChild(body);

        this._sections[def.key] = body;
      }

      var canvasToggle = document.createElement('div');
      canvasToggle.style.cssText = 'margin-top:10px;border-top:1px solid #00ffff44;padding-top:6px;';
      canvasToggle.innerHTML = '<span style="color:#aaaaaa;font-size:10px;">Colisões: </span>' +
        '<span id="dbg-canvas-status" style="color:#ff4444;">DESLIGADO</span>' +
        ' <button id="dbg-canvas-toggle" style="' +
        'background:#003333;border:1px solid #00ffff44;color:#00ffff;' +
        'font-family:monospace;font-size:10px;cursor:pointer;padding:1px 6px;margin-left:6px;' +
        '">alternar</button>';
      panel.appendChild(canvasToggle);

      document.body.appendChild(panel);
      this._panel = panel;

      var self = this;
      var btn = panel.querySelector('#dbg-canvas-toggle');
      if (btn) {
        btn.addEventListener('click', function () { self.toggleCanvasDebug(); });
      }
    },

    _createToggleButton: function () {
      var btn = document.createElement('button');
      btn.id = 'debug-corner-btn';
      btn.textContent = 'DBG';
      btn.style.cssText = [
        'position:fixed',
        'bottom:4px',
        'right:4px',
        'z-index:100000',
        'background:#000000aa',
        'color:#00ffff',
        'border:1px solid #00ffff55',
        'font-family:monospace',
        'font-size:10px',
        'padding:2px 6px',
        'cursor:pointer',
        'letter-spacing:1px'
      ].join(';');
      var self = this;
      btn.addEventListener('click', function () { self.toggle(); });
      document.body.appendChild(btn);
      this._toggleBtn = btn;
    },

    _attachKeyListener: function () {
      var self = this;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'F3') {
          e.preventDefault();
          self.toggle();
        } else if (e.key === 'F4') {
          e.preventDefault();
          self.toggleCanvasDebug();
        }
      });
    },

    toggle: function () {
      this.isVisible = !this.isVisible;
      if (this._panel) {
        this._panel.style.display = this.isVisible ? 'block' : 'none';
      }
    },

    toggleCanvasDebug: function () {
      this.isCanvasDebugVisible = !this.isCanvasDebugVisible;
      var el = document.getElementById('dbg-canvas-status');
      if (el) {
        el.textContent = this.isCanvasDebugVisible ? 'LIGADO' : 'DESLIGADO';
        el.style.color = this.isCanvasDebugVisible ? '#00ff88' : '#ff4444';
      }
    },

    _computeFPS: function () {
      var now = performance.now();
      var delta = now - this._lastFrameTime;
      this._lastFrameTime = now;
      this._frameTime = delta;

      this._frameTimes.push(delta);
      if (this._frameTimes.length > this._maxFrameSamples) {
        this._frameTimes.shift();
      }

      var sum = 0;
      for (var i = 0; i < this._frameTimes.length; i++) {
        sum += this._frameTimes[i];
      }
      var avg = sum / this._frameTimes.length;
      this._fps = avg > 0 ? (1000 / avg) : 0;
    },

    _setText: function (sectionKey, lines) {
      var el = this._sections[sectionKey];
      if (!el) return;
      el.innerHTML = lines.join('<br>');
    },

    _row: function (label, value, color) {
      color = color || '#00ffff';
      return '<span style="color:#88aaaa;">' + label + ':</span> ' +
             '<span style="color:' + color + ';">' + value + '</span>';
    },

    update: function (gameState) {
      this._computeFPS();
      if (!this.isVisible) return;

      // throttle DOM writes (the FPS sampling above still runs every frame)
      var nowT = performance.now();
      if (nowT - (this._lastDomUpdate || 0) < 120) return;
      this._lastDomUpdate = nowT;

      var gs = gameState || {};

      var fps = gs.fps !== undefined ? gs.fps : this._fps;
      var frameMs = this._frameTime.toFixed(2);
      var fpsColor = fps >= 55 ? '#00ff88' : fps >= 30 ? '#ffff00' : '#ff4444';

      this._setText('perf', [
        this._row('FPS', fps.toFixed(1), fpsColor),
        this._row('Tempo de quadro', frameMs + ' ms')
      ]);

      var enemies    = gs.enemies    || [];
      var projectiles= gs.projectiles|| [];
      var asteroids  = gs.asteroids  || [];
      var particles  = gs.particles  || [];
      var powerups   = gs.powerups   || [];

      var enemyCount  = Array.isArray(enemies)    ? enemies.length    : (enemies   || 0);
      var projCount   = Array.isArray(projectiles) ? projectiles.length: (projectiles|| 0);
      var astCount    = Array.isArray(asteroids)   ? asteroids.length  : (asteroids  || 0);
      var partCount   = Array.isArray(particles)   ? particles.length  : (particles  || 0);
      var powCount    = Array.isArray(powerups)    ? powerups.length   : (powerups   || 0);

      this._setText('entities', [
        this._row('Inimigos',     enemyCount,  enemyCount  > 0 ? '#ff8844' : '#00ffff'),
        this._row('Projéteis', projCount,   projCount   > 0 ? '#ffff44' : '#00ffff'),
        this._row('Asteroides',   astCount,    astCount    > 0 ? '#aa88ff' : '#00ffff'),
        this._row('Partículas',   partCount,   partCount   > 50? '#ff4444' : '#00ffff'),
        this._row('Power-ups',    powCount,    powCount    > 0 ? '#00ff88' : '#00ffff')
      ]);

      var state = gs.state !== undefined ? gs.state : '—';
      var wave  = gs.wave  !== undefined ? gs.wave  : '—';

      this._setText('gamestate', [
        this._row('Estado', state, '#ffffff'),
        this._row('Onda',  wave,  '#ffaa00')
      ]);

      var player = gs.player || {};
      var px = player.x !== undefined ? player.x.toFixed(1) : '—';
      var py = player.y !== undefined ? player.y.toFixed(1) : '—';
      var ph = player.health !== undefined ? player.health : '—';
      var pmaxh = player.maxHealth || player.maxHp || '?';
      var pcombo= player.combo !== undefined ? player.combo : '—';
      var healthPct = (player.health !== undefined && (pmaxh !== '?'))
        ? Math.round((player.health / pmaxh) * 100)
        : null;
      var healthColor = healthPct !== null
        ? (healthPct > 60 ? '#00ff88' : healthPct > 30 ? '#ffff00' : '#ff4444')
        : '#00ffff';

      this._setText('player', [
        this._row('Posição', '(' + px + ', ' + py + ')'),
        this._row('Vida', ph + (pmaxh !== '?' ? ' / ' + pmaxh : '') + (healthPct !== null ? '  (' + healthPct + '%)' : ''), healthColor),
        this._row('Combo',  pcombo, pcombo > 0 ? '#ff88ff' : '#00ffff')
      ]);

      var aiBehaviors = this._summarizeAI(Array.isArray(enemies) ? enemies : []);
      this._setText('ai', aiBehaviors.length > 0 ? aiBehaviors : [this._row('Comportamentos', 'nenhum')]);

      var colLines = [];
      for (var c = 0; c < this._collisionLog.length; c++) {
        var ev = this._collisionLog[c];
        var ago = ((performance.now() - ev.timestamp) / 1000).toFixed(1);
        colLines.push(
          '<span style="color:#ff8844;">' + (ev.type || 'collision') + '</span>' +
          ' <span style="color:#888888;">' + ago + 's ago</span>' +
          (ev.detail ? ' <span style="color:#aaaaaa;">' + ev.detail + '</span>' : '')
        );
      }
      this._setText('collisions', colLines.length > 0 ? colLines : ['<span style="color:#444444;">—</span>']);

      var memLines = [];
      if (global.performance && global.performance.memory) {
        var mem = global.performance.memory;
        memLines.push(this._row('Heap JS usado',  this._fmtBytes(mem.usedJSHeapSize)));
        memLines.push(this._row('Heap JS total', this._fmtBytes(mem.totalJSHeapSize)));
        memLines.push(this._row('Heap JS limite', this._fmtBytes(mem.jsHeapSizeLimit)));
      } else {
        memLines.push('<span style="color:#444444;">Indisponível neste navegador</span>');
      }
      this._setText('memory', memLines);
    },

    _summarizeAI: function (enemies) {
      if (!enemies || enemies.length === 0) return [];
      var counts = {};
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        var state = e.aiState || e.state || e.behavior || e.mode || 'unknown';
        var type  = e.type || e.enemyType || 'enemy';
        var key   = type + ':' + state;
        counts[key] = (counts[key] || 0) + 1;
      }
      var lines = [];
      for (var k in counts) {
        if (Object.prototype.hasOwnProperty.call(counts, k)) {
          lines.push(this._row(k, 'x' + counts[k], '#ff8844'));
        }
      }
      return lines;
    },

    _fmtBytes: function (bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    },

    addCollisionEvent: function (event) {
      var ev = {
        type: event.type || 'collision',
        detail: event.detail || event.message || null,
        timestamp: performance.now()
      };
      this._collisionLog.unshift(ev);
      if (this._collisionLog.length > this._maxCollisionLog) {
        this._collisionLog.length = this._maxCollisionLog;
      }
    },

    drawCanvasOverlay: function (ctx, enemies, asteroids, projectiles, player) {
      if (!this.isCanvasDebugVisible || !ctx) return;

      ctx.save();

      enemies = enemies || [];
      asteroids = asteroids || [];
      projectiles = projectiles || [];

      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (!e) continue;
        var ex = e.x || 0;
        var ey = e.y || 0;
        var er = e.radius || e.r || 16;

        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,80,80,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,80,80,0.08)';
        ctx.fill();

        var vx = e.vx || e.velocityX || 0;
        var vy = e.vy || e.velocityY || 0;
        var speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 0.01) {
          var len = 40;
          var nx = vx / speed;
          var ny = vy / speed;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex + nx * len, ey + ny * len);
          ctx.strokeStyle = 'rgba(255,200,0,0.8)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          this._drawArrowHead(ctx, ex + nx * len, ey + ny * len, nx, ny, 7, 'rgba(255,200,0,0.8)');
        }

        if (player && (e.targeting || e.aiState === 'chase' || e.aiState === 'attack' || e.mode === 'attack')) {
          var px = player.x || 0;
          var py = player.y || 0;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(px, py);
          ctx.strokeStyle = 'rgba(255,0,100,0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        var typeLabel = e.type || e.enemyType || '';
        var stateLabel = e.aiState || e.state || e.behavior || '';
        if (typeLabel || stateLabel) {
          ctx.font = '9px monospace';
          ctx.fillStyle = 'rgba(255,200,100,0.9)';
          ctx.fillText((typeLabel + ' ' + stateLabel).trim(), ex - er, ey - er - 3);
        }
      }

      for (var j = 0; j < asteroids.length; j++) {
        var a = asteroids[j];
        if (!a) continue;
        var ax = a.x || 0;
        var ay = a.y || 0;
        var ar = a.radius || a.r || 20;

        ctx.beginPath();
        ctx.arc(ax, ay, ar, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(150,100,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(150,100,255,0.06)';
        ctx.fill();

        var avx = a.vx || a.velocityX || 0;
        var avy = a.vy || a.velocityY || 0;
        var aspeed = Math.sqrt(avx * avx + avy * avy);
        if (aspeed > 0.01) {
          var alen = 30;
          var anx = avx / aspeed;
          var any = avy / aspeed;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax + anx * alen, ay + any * alen);
          ctx.strokeStyle = 'rgba(180,140,255,0.6)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      for (var k = 0; k < projectiles.length; k++) {
        var p = projectiles[k];
        if (!p) continue;
        var ppx = p.x || 0;
        var ppy = p.y || 0;
        var pr  = p.radius || p.r || 4;
        var pvx = p.vx || p.velocityX || 0;
        var pvy = p.vy || p.velocityY || 0;
        var pspeed = Math.sqrt(pvx * pvx + pvy * pvy);

        ctx.beginPath();
        ctx.arc(ppx, ppy, pr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,255,200,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (pspeed > 0.01) {
          var plen = 25;
          var pnx = pvx / pspeed;
          var pny = pvy / pspeed;
          ctx.beginPath();
          ctx.moveTo(ppx, ppy);
          ctx.lineTo(ppx + pnx * plen, ppy + pny * plen);
          ctx.strokeStyle = 'rgba(0,255,200,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      if (player) {
        var plx = player.x || 0;
        var ply = player.y || 0;
        var plr = player.radius || player.r || 20;
        ctx.beginPath();
        ctx.arc(plx, ply, plr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,200,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,200,255,0.06)';
        ctx.fill();
      }

      ctx.restore();
    },

    _drawArrowHead: function (ctx, x, y, nx, ny, size, color) {
      var angle = Math.atan2(ny, nx);
      var a1 = angle + Math.PI * 0.8;
      var a2 = angle - Math.PI * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a1) * size, y + Math.sin(a1) * size);
      ctx.lineTo(x + Math.cos(a2) * size, y + Math.sin(a2) * size);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  global.DebugManager = DebugManager;

}(typeof window !== 'undefined' ? window : this));
