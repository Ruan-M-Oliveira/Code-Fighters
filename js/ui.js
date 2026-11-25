(function (global) {
  'use strict';

  var FONT = '"Segoe UI","Helvetica Neue",Arial,sans-serif';
  var MONO = '"Courier New",Courier,monospace';

  var FX_META = [
    { type: 'SHIELD',      label: 'ESCUDO',      color: '#4488ff' },
    { type: 'RAPID_FIRE',  label: 'TIRO RÁPIDO', color: '#ffcc00' },
    { type: 'MULTI_SHOT',  label: 'TIRO TRIPLO', color: '#00eeff' },
    { type: 'SPEED_BOOST', label: 'TURBO',       color: '#44ff88' }
  ];

  /* ───────────────────────── canvas helpers ───────────────────────── */

  function text(ctx, s, x, y, size, color, align, weight, font, spacing) {
    ctx.font = (weight || '600') + ' ' + size + 'px ' + (font || FONT);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (spacing || 0) + 'px';
    ctx.fillText(s, x, y);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // The one "glass" element of the HUD
  function panel(ctx, x, y, w, h) {
    roundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = 'rgba(8,20,48,0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function pad8(n) { return global.Utils.formatScore(n); }

  /* ───────────────────────── leaderboard helpers ───────────────────────── */

  var MEDAL = {
    1: { a: '#fff1b8', b: '#ffd34d', c: '#ff9f2b', label: 'OURO' },
    2: { a: '#ffffff', b: '#d9e4f2', c: '#8fa3bd', label: 'PRATA' },
    3: { a: '#ffd9b8', b: '#e0915a', c: '#9c5a2e', label: 'BRONZE' }
  };

  // plain thousands separators for the board (the HUD keeps its 8-digit counter)
  function fmtScore(n) { return String(Math.floor(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var _svgId = 0;
  function trophySVG(tone, cls) {
    var m = MEDAL[tone] || MEDAL[1];
    var id = 'tg' + (++_svgId);
    return '<svg class="trophy ' + (cls || '') + '" viewBox="0 0 64 64" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + m.a + '"/><stop offset=".45" stop-color="' + m.b + '"/><stop offset="1" stop-color="' + m.c + '"/>' +
      '</linearGradient></defs>' +
      '<path fill="none" stroke="url(#' + id + ')" stroke-width="4" stroke-linecap="round" d="M17 14H8c0 10 5 16 12 17M47 14h9c0 10-5 16-12 17"/>' +
      '<path fill="url(#' + id + ')" d="M16 8h32v12c0 10-7 18-16 18S16 30 16 20z"/>' +
      '<rect fill="url(#' + id + ')" x="28" y="37" width="8" height="9"/>' +
      '<path fill="url(#' + id + ')" d="M20 46h24l3 9H17z"/>' +
      '<path fill="#ffffff" opacity=".55" d="M21 11h4v10c0 5 2 9 5 11-6-1-9-6-9-11z"/>' +
    '</svg>';
  }

  /** Top 3 list markup. highlightId marks the current run's entry. */
  function boardHTML(entries, highlightId) {
    var h = '<ol class="lb">';
    for (var i = 0; i < 3; i++) {
      var e = entries[i];
      var r = i + 1;
      if (e) {
        h += '<li class="lb-row r' + r + (e.id === highlightId ? ' me' : '') + '">' +
          '<span class="lb-medal">' + r + '</span>' +
          '<span class="lb-name">' + esc(e.name) + (e.id === highlightId ? ' <em>VOCÊ</em>' : '') + '</span>' +
          '<span class="lb-wave">' + (e.wave ? 'ONDA ' + e.wave : '') + '</span>' +
          '<span class="lb-score">' + fmtScore(e.score) + '</span></li>';
      } else {
        h += '<li class="lb-row r' + r + ' empty"><span class="lb-medal">' + r + '</span>' +
          '<span class="lb-name">-- VAZIO --</span><span class="lb-wave"></span><span class="lb-score">-----</span></li>';
      }
    }
    return h + '</ol>';
  }

  function runSummaryHTML(prefix) {
    return '<div class="run-id"><span>CODINOME</span><b id="' + prefix + '-name">---</b></div>' +
      '<div class="final-score"><span>PONTUAÇÃO FINAL</span><b id="' + prefix + '-final">0</b></div>' +
      '<div class="rank-banner" id="' + prefix + '-rank"></div>' +
      '<div class="stats">' +
        '<div><span>ONDA MÁXIMA</span><b id="' + prefix + '-wave">1</b></div>' +
        '<div><span>INIMIGOS ABATIDOS</span><b id="' + prefix + '-kills">0</b></div>' +
      '</div>' +
      '<div class="board-wrap"><div class="board-head">' + trophySVG(1, 'sm') + '<span>CODE FIGHTERS · TOP 3</span></div>' +
        '<div id="' + prefix + '-board"></div></div>';
  }

  // canvas trophy (same shape as the SVG one), cached Path2D objects
  var _tp = null;
  function drawTrophy(ctx, x, y, size, m, time) {
    if (typeof Path2D !== 'function') return;
    if (!_tp) {
      _tp = {
        handles: new Path2D('M17 14H8c0 10 5 16 12 17M47 14h9c0 10-5 16-12 17'),
        cup: new Path2D('M16 8h32v12c0 10-7 18-16 18S16 30 16 20z'),
        base: new Path2D('M28 37h8v9h-8zM20 46h24l3 9H17z'),
        shine: new Path2D('M21 11h4v10c0 5 2 9 5 11-6-1-9-6-9-11z')
      };
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 64, size / 64);
    var gr = ctx.createLinearGradient(0, 8, 0, 56);
    gr.addColorStop(0, m.a); gr.addColorStop(0.45, m.b); gr.addColorStop(1, m.c);
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(255,190,60,0.55)';
    ctx.strokeStyle = gr;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke(_tp.handles);
    ctx.fillStyle = gr;
    ctx.fill(_tp.cup);
    ctx.fill(_tp.base);
    ctx.shadowBlur = 0;
    // periodic glint
    var gl = (time * 0.5) % 3;
    ctx.globalAlpha *= gl < 0.4 ? 0.35 + Math.sin(gl / 0.4 * Math.PI) * 0.6 : 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.fill(_tp.shine);
    ctx.restore();
  }

  /* ───────────────────────── markup for DOM screens ───────────────────────── */

  var SCREENS = {
    main:
      '<div class="title-block">' +
        '<h1 class="title">CODE<br>FIGHTERS</h1>' +
        '<p class="subtitle">COMBATE ESPACIAL</p>' +
      '</div>' +
      '<nav class="menu-list">' +
        '<button class="btn" data-act="start">INICIAR</button>' +
        '<button class="btn" data-act="howto">COMO JOGAR</button>' +
        '<button class="btn" data-act="settings">CONFIGURAÇÕES</button>' +
        '<button class="btn" data-act="highscore">RECORDE</button>' +
      '</nav>' +
      '<p class="menu-hint">Painel do motor: <b>F3</b> &nbsp; Colisões: <b>F4</b></p>',

    howto:
      '<div class="panel">' +
        '<h2>Como jogar</h2>' +
        '<div class="howto-grid">' +
          '<div class="howto-block"><h3>MOVER</h3>' +
            '<div class="keys"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></div>' +
            '<p>ou as setas. Na diagonal a nave não fica mais rápida.</p></div>' +
          '<div class="howto-block"><h3>MIRAR</h3>' +
            '<div class="keys"><span class="key wide">MOUSE</span></div>' +
            '<p>A nave sempre aponta para o cursor.</p></div>' +
          '<div class="howto-block"><h3>ATIRAR</h3>' +
            '<div class="keys"><span class="key wide">CLIQUE ESQ.</span><span class="key wide">ESPAÇO</span></div>' +
            '<p>Segure para disparar sem parar.</p></div>' +
          '<div class="howto-block"><h3>ESPECIAL</h3>' +
            '<div class="keys"><span class="key">Q</span><span class="key wide">CLIQUE DIR.</span></div>' +
            '<p>Onda de choque, liberada pela melhoria de mesmo nome.</p></div>' +
          '<div class="howto-block"><h3>PAUSAR</h3>' +
            '<div class="keys"><span class="key">ESC</span></div>' +
            '<p>Continue, reinicie ou volte ao menu.</p></div>' +
        '</div>' +
        '<h3 class="sub">POWER-UPS (TEMPORÁRIOS)</h3>' +
        '<ul class="legend">' +
          '<li><i style="background:#4488ff"></i><span><b>Escudo</b> absorve todos os golpes por 8 s</span></li>' +
          '<li><i style="background:#ffcc00"></i><span><b>Tiro rápido</b> mais que dobra a cadência</span></li>' +
          '<li><i style="background:#00eeff"></i><span><b>Tiro triplo</b> dispara um leque de três tiros</span></li>' +
          '<li><i style="background:#44ff88"></i><span><b>Turbo</b> +50% de velocidade</span></li>' +
          '<li><i style="background:#ff4488"></i><span><b>Reparo</b> recupera a vida da nave</span></li>' +
        '</ul>' +
        '<h3 class="sub">MELHORIAS (PERMANENTES)</h3>' +
        '<ul class="legend">' +
          '<li><i style="background:#ffe27a"></i><span><b>Núcleo dourado</b> melhora a nave até o fim da partida</span></li>' +
          '<li><i style="background:#ff7a5c"></i><span><b>Dano</b>, <b>Cadência</b>, <b>Tiro múltiplo</b> e <b>Velocidade do projétil</b> evoluem a arma (5 níveis)</span></li>' +
          '<li><i style="background:#4488ff"></i><span><b>Barreira de energia</b> absorve um impacto e recarrega sozinha</span></li>' +
          '<li><i style="background:#c58cff"></i><span><b>Onda de choque</b> e <b>Propulsores</b> completam o arsenal</span></li>' +
        '</ul>' +
        '<h3 class="sub">SOBREVIVA</h3>' +
        '<p class="body">Destrua todos os inimigos para concluir a onda. Cada onda vencida deixa um núcleo de melhoria. ' +
        'Asteroides se partem em pedaços menores. Encadeie abates em poucos segundos para aumentar o multiplicador. ' +
        'Um chefe aguarda na onda 5 &mdash; resista até a onda 10 para vencer.</p>' +
        '<button class="btn small" data-act="back">VOLTAR</button>' +
      '</div>',

    settings:
      '<div class="panel narrow">' +
        '<h2>Configurações</h2>' +
        '<div class="row"><span>Som</span><button class="toggle" id="set-sound" data-act="toggle-sound"></button></div>' +
        '<div class="row"><span>Volume geral</span><span class="range-wrap"><input type="range" min="0" max="100" step="5" id="set-volume" data-range="volume" aria-label="Volume geral"><b id="set-volume-val"></b></span></div>' +
        '<div class="row"><span>Volume da música</span><span class="range-wrap"><input type="range" min="0" max="100" step="5" id="set-music" data-range="music" aria-label="Volume da música"><b id="set-music-val"></b></span></div>' +
        '<div class="row"><span>Tremor de tela</span><button class="toggle" id="set-shake" data-act="toggle-shake"></button></div>' +
        '<div class="row"><span>Tela cheia</span><button class="toggle" id="set-fs" data-act="toggle-fs"></button></div>' +
        '<div class="row"><span>Dificuldade</span><button class="toggle" id="set-diff" data-act="difficulty"></button></div>' +
        '<div class="row"><span>Painel do motor (F3)</span><button class="toggle" id="set-insight" data-act="toggle-insight"></button></div>' +
        '<div class="row"><span>Mostrar colisões (F4)</span><button class="toggle" id="set-overlay" data-act="toggle-overlay"></button></div>' +
        '<button class="btn small" data-act="back">VOLTAR</button>' +
      '</div>',

    callsign:
      '<div class="panel narrow center cab">' +
        '<div class="cab-top"><span class="cab-led"></span>JOGADOR 1 &nbsp;·&nbsp; CRÉDITOS 01</div>' +
        '<h2 class="cab-title">Identificação do piloto</h2>' +
        '<p class="cab-sub">DIGITE SEU CODINOME</p>' +
        '<label class="cs-field" for="cs-input">' +
          '<span class="cs-br">[</span><span class="cs-slots" id="cs-slots"></span><span class="cs-br">]</span>' +
          '<input id="cs-input" type="text" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Codinome (3 a 10 caracteres)">' +
        '</label>' +
        '<div class="cs-meta"><span id="cs-hint">3 a 10 caracteres · letras, números, - e _</span><b id="cs-count">0/10</b></div>' +
        '<p class="cs-target" id="cs-target"></p>' +
        '<button class="btn cs-go" id="cs-go" data-act="callsign-go" disabled>PRESSIONE ENTER PARA INICIAR</button>' +
        '<button class="btn small ghost" data-act="back">VOLTAR</button>' +
      '</div>',

    ships:
      '<canvas class="ss-bg" id="ss-bg" aria-hidden="true"></canvas>' +
      '<div class="ss-wrap">' +
        '<header class="ss-head">' +
          '<div class="ss-logo"><span class="ss-plate"><span class="ss-logo-text">CODE FIGHTERS</span></span></div>' +
          '<h2 class="ss-sub">SELECIONE SUA NAVE</h2>' +
          '<p class="ss-pilot">PILOTO: <b id="ss-pilot">---</b> &nbsp;/&nbsp; <span id="ss-record">SEM RECORDE NO TOP 3</span></p>' +
        '</header>' +
        '<div class="ss-cards" id="ss-cards" role="listbox" aria-label="Naves disponíveis"></div>' +
        '<div class="ss-launch-row"><button class="ss-launch" data-act="ship-go"><span>LANÇAR</span></button></div>' +
        '<p class="ss-keys">&#9664; &#9654; ESCOLHER &nbsp;·&nbsp; 1-4 ATALHO &nbsp;·&nbsp; ENTER LANÇAR &nbsp;·&nbsp; ESC VOLTAR</p>' +
        '<button class="ss-back" data-act="ship-back">VOLTAR</button>' +
      '</div>',

    highscore:
      '<div class="panel narrow center hs">' +
        '<div class="hs-trophy">' + trophySVG(1, 'lg') + '</div>' +
        '<h2>Os maiores pilotos</h2>' +
        '<div id="hs-board"></div>' +
        '<p class="body" id="hs-wave"></p>' +
        '<div class="btn-row">' +
          '<button class="btn small ghost" data-act="reset-score" id="hs-reset">ZERAR</button>' +
          '<button class="btn small" data-act="back">VOLTAR</button>' +
        '</div>' +
      '</div>',

    pause:
      '<div class="panel narrow center">' +
        '<h2>Pausado</h2>' +
        '<nav class="menu-list">' +
          '<button class="btn" data-act="resume">CONTINUAR</button>' +
          '<button class="btn" data-act="restart">REINICIAR</button>' +
          '<button class="btn" data-act="menu">MENU PRINCIPAL</button>' +
        '</nav>' +
      '</div>',

    gameover:
      '<div class="panel narrow center">' +
        '<h2 class="danger">Fim de jogo</h2>' +
        '<p class="body">Sua nave foi destruída.</p>' +
        runSummaryHTML('go') +
        '<nav class="menu-list">' +
          '<button class="btn" data-act="restart">REINICIAR</button>' +
          '<button class="btn" data-act="menu">MENU PRINCIPAL</button>' +
        '</nav>' +
      '</div>',

    victory:
      '<div class="panel narrow center">' +
        '<h2 class="win">Vitória!</h2>' +
        '<p class="body">Você segurou a linha e limpou o setor.</p>' +
        runSummaryHTML('vic') +
        '<nav class="menu-list">' +
          '<button class="btn" data-act="continue">CONTINUAR (INFINITO)</button>' +
          '<button class="btn" data-act="restart">JOGAR DE NOVO</button>' +
          '<button class="btn" data-act="menu">MENU PRINCIPAL</button>' +
        '</nav>' +
      '</div>'
  };

  /* ═════════════════════════════ UIManager ═════════════════════════════ */

  var UIManager = {
    game: null,
    root: null,
    screens: {},
    current: null,
    _hp: 100,
    _bossHp: 1,
    _comboPop: 0,
    _lastCombo: 0,

    init: function (game) {
      this.game = game;
      this.root = document.getElementById('ui-overlay');
      var self = this;

      for (var name in SCREENS) {
        if (!Object.prototype.hasOwnProperty.call(SCREENS, name)) continue;
        var el = document.createElement('div');
        el.className = 'screen screen-' + name;
        el.innerHTML = SCREENS[name];
        this.root.appendChild(el);
        this.screens[name] = el;
      }

      // one delegated listener handles every button
      this.root.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
        if (t) self.handle(t.getAttribute('data-act'));
      });
      // callsign field: sanitise as the player types, Enter confirms
      var cs = document.getElementById('cs-input');
      if (cs) {
        cs.addEventListener('input', function () { self._csUpdate(); });
        cs.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); self.confirmCallsign(); }
          else if (e.key !== 'Escape') game.audio.play('menuHover');
        });
        cs.addEventListener('focus', function () { self._csUpdate(); });
        cs.addEventListener('blur', function () { self._csUpdate(); });
        // if the field lost focus (click elsewhere, window switch), the keyboard
        // still types into it: refocusing during keydown redirects the character
        document.addEventListener('keydown', function (e) {
          if (self.current !== 'callsign' || document.activeElement === cs) return;
          if (e.ctrlKey || e.metaKey || e.altKey || e.key === 'Escape' || e.key === 'Tab') return;
          e.stopPropagation();           // keep P/WASD/space away from the game handlers
          if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); self.confirmCallsign(); return; }
          cs.focus();
        });
        // ship selection keyboard: arrows / A D, 1-4, Enter or Space to confirm
        document.addEventListener('keydown', function (e) {
          if (self.current !== 'ships' || e.ctrlKey || e.metaKey || e.altKey) return;
          var c = e.code, handled = true;
          if (c === 'ArrowLeft' || c === 'KeyA') self._selectShip(self._shipIdx - 1);
          else if (c === 'ArrowRight' || c === 'KeyD') self._selectShip(self._shipIdx + 1);
          else if (/^Digit[1-4]$/.test(c)) self._selectShip(Number(c.slice(5)) - 1);
          else if (c === 'ArrowUp' || c === 'ArrowDown' || c === 'KeyW' || c === 'KeyS') {
            // 2 x 2 layout on narrow screens: up / down jumps a row
            var cards = self._cardEls;
            var wrapped = cards && cards.length > 2 && cards[2].offsetTop > cards[0].offsetTop + 10;
            if (wrapped) self._selectShip(self._shipIdx + 2); else handled = false;
          }
          else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') {
            // ignore the key press that confirmed the callsign
            if (!e.repeat && performance.now() - self._shipOpenedAt > 250) { game.audio.play('menuClick'); self.confirmShip(); }
          }
          else handled = false;
          if (handled) { e.preventDefault(); e.stopPropagation(); }
        });
        global.addEventListener('focus', function () {
          if (self.current === 'callsign') { try { cs.focus(); } catch (err) { /* ignore */ } }
        });
      }

      // volume sliders
      this.root.addEventListener('input', function (e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var key = t.getAttribute('data-range');
        if (!key) return;
        game.setSetting(key, Number(t.value) || 0);
        self.refreshSettings();
      });
      this.root.addEventListener('mouseover', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.btn, .toggle') : null;
        if (t && game.audio) game.audio.play('menuHover');
      });
    },

    show: function (name) {
      for (var k in this.screens) {
        if (Object.prototype.hasOwnProperty.call(this.screens, k)) this.screens[k].classList.remove('visible');
      }
      this.current = name;
      if (this.screens[name]) this.screens[name].classList.add('visible');
    },

    hideAll: function () {
      this.show(null);
    },

    handle: function (act) {
      var g = this.game;
      g.audio.play('menuClick');
      switch (act) {
        case 'start':    this.openCallsign(); return;
        case 'callsign-go': this.confirmCallsign(); return;
        case 'ship-prev': this._selectShip(this._shipIdx - 1, true); return;
        case 'ship-next': this._selectShip(this._shipIdx + 1, true); return;
        case 'ship-go':   this.confirmShip(); return;
        case 'ship-back': this.openCallsign(true); return;
        case 'howto':    this.show('howto'); return;
        case 'settings': this.refreshSettings(); this.show('settings'); return;
        case 'highscore': this.refreshHighScore(); this.show('highscore'); return;
        case 'back':     this._resetArmed = false; this.show('main'); return;
        case 'resume':   g.resume(); return;
        case 'restart':  g.startGame(); return;
        case 'menu':     g.enterMenu(); return;
        case 'continue': g.continueEndless(); return;
        case 'toggle-sound': g.setSetting('sound', !g.settings.sound); break;
        case 'toggle-shake': g.setSetting('shake', !g.settings.shake); break;
        case 'toggle-fs':    g.toggleFullscreen(); break;
        case 'difficulty':   g.cycleDifficulty(); break;
        case 'toggle-insight': global.DebugManager.toggle(); break;
        case 'toggle-overlay': global.DebugManager.toggleCanvasDebug(); break;
        case 'ship-pick-0': case 'ship-pick-1': case 'ship-pick-2': case 'ship-pick-3':
          this._selectShip(Number(act.slice(10)), true);
          return;
        case 'reset-score':
          // two-step confirmation: records are never wiped by a stray click
          if (!this._resetArmed) { this._resetArmed = true; this.refreshHighScore(); return; }
          this._resetArmed = false;
          g.resetSave();
          global.Leaderboard.clear();
          this.refreshHighScore();
          return;
      }
      this.refreshSettings();
    },

    _toggle: function (id, on, onText, offText) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = on ? onText : offText;
      if (on) el.classList.add('on'); else el.classList.remove('on');
    },

    refreshSettings: function () {
      var g = this.game;
      var D = global.DebugManager;
      this._toggle('set-sound', g.settings.sound, 'LIGADO', 'DESLIGADO');
      this._toggle('set-shake', g.settings.shake, 'LIGADO', 'DESLIGADO');
      this._toggle('set-fs', !!document.fullscreenElement, 'LIGADO', 'DESLIGADO');
      var ranges = ['volume', 'music'];
      for (var r = 0; r < ranges.length; r++) {
        var inp = document.getElementById('set-' + ranges[r]);
        var lab = document.getElementById('set-' + ranges[r] + '-val');
        var val = g.settings[ranges[r]];
        if (inp && document.activeElement !== inp) inp.value = val;
        if (lab) lab.textContent = val + '%';
      }
      var diff = document.getElementById('set-diff');
      if (diff) { diff.textContent = g.difficultyLabel(); diff.classList.add('on'); }
      this._toggle('set-insight', D && D.isVisible, 'LIGADO', 'DESLIGADO');
      this._toggle('set-overlay', D && D.isCanvasDebugVisible, 'LIGADO', 'DESLIGADO');
    },

    refreshHighScore: function () {
      var g = this.game;
      var LB = global.Leaderboard;
      var b = document.getElementById('hs-board');
      var w = document.getElementById('hs-wave');
      var r = document.getElementById('hs-reset');
      if (b) b.innerHTML = boardHTML(LB.load(), null);
      if (w) w.textContent = g.save.bestWave > 0 ? 'Melhor onda alcançada: ' + g.save.bestWave : 'Nenhuma partida registrada ainda.';
      if (r) {
        r.textContent = this._resetArmed ? 'CONFIRMAR?' : 'ZERAR';
        r.classList.toggle('armed', !!this._resetArmed);
      }
    },

    /* ═════════════ ship selection (hangar) ═════════════ */

    openShips: function (callsign) {
      var Sh = global.Ships;
      this._pendingCallsign = callsign;
      this._shipOpenedAt = performance.now();
      if (!this._cardsBuilt) this._buildShipCards();
      var pilot = document.getElementById('ss-pilot');
      if (pilot) pilot.textContent = callsign;
      // the pilot's own best Top 3 score (real data; nothing is invented)
      var best = 0, list = global.Leaderboard.load();
      for (var i = 0; i < list.length; i++) if (list[i].name === callsign && list[i].score > best) best = list[i].score;
      var rec = document.getElementById('ss-record');
      if (rec) rec.textContent = best ? 'RECORDE: ' + fmtScore(best) : 'SEM RECORDE NO TOP 3';
      this._ssT = 0;
      this._selectShip(Math.max(0, Sh.ids.indexOf(this.game.shipId)), true);
      this.show('ships');
    },

    // four cards, built once from the ship definitions
    _buildShipCards: function () {
      var Sh = global.Ships, box = document.getElementById('ss-cards'), h = '';
      for (var i = 0; i < Sh.list.length; i++) {
        var s = Sh.list[i], st = Sh.cardStats(s);
        h += '<button class="ss-card" data-act="ship-pick-' + i + '" role="option" aria-selected="false" style="--ship:' + s.accent + '">' +
          '<span class="ss-frame">' +
            '<i class="ss-bar t"></i><i class="ss-bar b"></i><i class="ss-notch l"></i><i class="ss-notch r"></i>' +
            '<i class="ss-rivet tl"></i><i class="ss-rivet tr"></i><i class="ss-rivet bl"></i><i class="ss-rivet br"></i>' +
            '<span class="ss-flag">SELECIONADA</span>' +
            '<canvas class="ss-ship" aria-hidden="true"></canvas>' +
            '<span class="ss-name">' + esc(s.name) + '</span>' +
            '<span class="ss-class">' + esc(s.cls) + '</span>' +
            '<span class="ss-stats">' +
              '<span>VIDA <b>' + st.hp + '</b></span><span>VELOC. <b>' + st.speed + '</b></span>' +
              '<span>DANO <b>' + st.damage + '</b></span><span>CADÊNCIA <b>' + st.rate + '</b></span>' +
            '</span>' +
            '<span class="ss-tag">' + esc(s.tag) + '</span>' +
          '</span>' +
        '</button>';
      }
      box.innerHTML = h;
      this._cardEls = box.querySelectorAll('.ss-card');
      this._cardCanvases = box.querySelectorAll('canvas.ss-ship');
      var self = this;
      // double click / double tap on a card launches straight away
      box.addEventListener('dblclick', function (e) {
        var c = e.target && e.target.closest ? e.target.closest('.ss-card') : null;
        if (c && self.current === 'ships') self.confirmShip();
      });
      this._cardsBuilt = true;
    },

    _selectShip: function (i, silent) {
      var Sh = global.Ships, n = Sh.list.length;
      var prev = this._shipIdx;
      this._shipIdx = ((i % n) + n) % n;
      if (this._cardEls) {
        for (var k = 0; k < this._cardEls.length; k++) {
          var on = k === this._shipIdx;
          this._cardEls[k].classList.toggle('on', on);
          this._cardEls[k].setAttribute('aria-selected', on ? 'true' : 'false');
        }
      }
      // the selected card test-fires its weapon (no world entities are created)
      if (prev !== this._shipIdx || !this._pv) {
        this._pv = { shots: [], cd: 0.5, burst: 0, heat: 0, muzzle: 0, alt: false };
      }
      if (!silent) this.game.audio.play('menuHover');
    },

    confirmShip: function () {
      var Sh = global.Ships;
      var id = Sh.list[this._shipIdx].id;
      this._pv = null;
      this.game.startGame(this._pendingCallsign, { ship: id });
    },

    /** Hangar backdrop + four live ship previews, drawn by the game loop. */
    drawShipPreview: function (dt) {
      if (!this._cardsBuilt) return;
      this._ssT = (this._ssT || 0) + dt;
      this._drawHangarBg(dt);
      var Sh = global.Ships;
      for (var i = 0; i < this._cardCanvases.length; i++) {
        this._drawShipCard(this._cardCanvases[i], Sh.list[i], i, i === this._shipIdx, dt);
      }
    },

    _fitCanvas: function (cv) {
      var w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return null;
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        cv._static = null;
      }
      var ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: ctx, w: w, h: h, dpr: dpr };
    },

    // space backdrop: pre-rendered planet / nebulae / station skyline + live stars and distant ships
    _drawHangarBg: function (dt) {
      var cv = document.getElementById('ss-bg');
      if (!cv) return;
      var f = this._fitCanvas(cv);
      if (!f) return;
      var ctx = f.ctx, w = f.w, h = f.h, t = this._ssT, i;
      if (!cv._static) cv._static = this._renderHangarStatic(w, h, f.dpr);
      // gentle parallax with the pointer
      var m = this.game.input.mouse;
      var px = ((m.x || w / 2) / w - 0.5), py = ((m.y || h / 2) / h - 0.5);
      ctx.drawImage(cv._static, -20 - px * 16, -20 - py * 10, w + 40, h + 40);

      var B = this._bgState;
      if (!B || B.w !== w || B.h !== h) {
        B = this._bgState = { w: w, h: h, stars: [], ships: [] };
        for (i = 0; i < 150; i++) {
          B.stars.push({ x: Math.random() * w, y: Math.random() * h * 0.8, z: 0.2 + Math.random() * 0.8, tw: Math.random() * 6.28 });
        }
        var ids = global.Ships.ids;
        for (i = 0; i < 4; i++) {
          B.ships.push({ id: ids[i], x: Math.random() * w, y: h * (0.08 + i * 0.09), v: 10 + Math.random() * 14, s: 0.55 + Math.random() * 0.45, dir: i % 2 ? -1 : 1 });
        }
      }
      // stars drifting slowly (depth = speed + size)
      for (i = 0; i < B.stars.length; i++) {
        var st = B.stars[i];
        st.x -= st.z * 6 * dt;
        if (st.x < -2) { st.x = w + 2; st.y = Math.random() * h * 0.8; }
        ctx.globalAlpha = (0.35 + 0.5 * st.z) * (0.75 + 0.25 * Math.sin(t * 2 + st.tw));
        ctx.fillStyle = st.z > 0.85 ? '#cfe8ff' : '#8fa6c8';
        var sz = st.z > 0.85 ? 1.6 : 1;
        ctx.fillRect(st.x - px * 30 * st.z, st.y - py * 18 * st.z, sz, sz);
      }
      ctx.globalAlpha = 1;
      // distant fleet: the game's own ships, small and dimmed, cruising across
      for (i = 0; i < B.ships.length; i++) {
        var d = B.ships[i];
        d.x += d.v * d.dir * dt;
        if (d.dir > 0 && d.x > w + 60) d.x = -60;
        if (d.dir < 0 && d.x < -60) d.x = w + 60;
        ctx.save();
        ctx.translate(d.x - px * 40, d.y - py * 20);
        ctx.rotate(d.dir > 0 ? 0.1 : Math.PI - 0.1);
        ctx.scale(d.s, d.s);
        ctx.globalAlpha = 0.42;
        global.Ships.draw(ctx, global.Ships.get(d.id), t + i, { tier: 1, multi: 0, moving: 0.6 });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    _renderHangarStatic: function (w, h, dpr) {
      var W = w + 40, H = h + 40;
      var c = document.createElement('canvas');
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      var g = c.getContext('2d');
      if (!g) return c;
      g.scale(dpr, dpr);
      var i;
      // deep space
      var bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#060a16');
      bg.addColorStop(0.6, '#0a0f1e');
      bg.addColorStop(1, '#05070d');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      // nebulae
      var neb = function (x, y, r, rgb, a) {
        var gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
        gr.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      };
      var M = Math.max(W, H);
      neb(W * 0.78, H * 0.2, M * 0.45, '40,70,150', 0.35);
      neb(W * 0.62, H * 0.08, M * 0.25, '90,50,150', 0.22);
      neb(W * 0.35, H * 0.55, M * 0.4, '120,60,30', 0.16);
      neb(W * 0.9, H * 0.6, M * 0.3, '20,90,120', 0.14);
      // faint static star dust
      for (i = 0; i < 260; i++) {
        g.globalAlpha = 0.15 + Math.random() * 0.35;
        g.fillStyle = '#9fb4d8';
        g.fillRect(Math.random() * W, Math.random() * H * 0.85, 1, 1);
      }
      g.globalAlpha = 1;
      // large planet on the left with an atmospheric rim
      var pr = Math.min(W, H) * 0.42, pcx = W * 0.04, pcy = H * 0.34;
      var pg = g.createRadialGradient(pcx + pr * 0.35, pcy - pr * 0.3, pr * 0.1, pcx, pcy, pr);
      pg.addColorStop(0, '#3a5a86');
      pg.addColorStop(0.45, '#1c2c4c');
      pg.addColorStop(0.8, '#0c1326');
      pg.addColorStop(1, '#070b16');
      g.fillStyle = pg;
      g.beginPath(); g.arc(pcx, pcy, pr, 0, Math.PI * 2); g.fill();
      // cloud bands
      g.save();
      g.beginPath(); g.arc(pcx, pcy, pr, 0, Math.PI * 2); g.clip();
      g.globalAlpha = 0.12;
      g.strokeStyle = '#9fc6ff';
      for (i = 0; i < 9; i++) {
        g.lineWidth = 3 + Math.random() * 7;
        g.beginPath();
        g.ellipse(pcx, pcy - pr + (i + 0.5) * pr * 0.22, pr * 1.1, pr * 0.05, -0.15, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
      g.globalAlpha = 1;
      var rim = g.createRadialGradient(pcx, pcy, pr * 0.92, pcx, pcy, pr * 1.08);
      rim.addColorStop(0, 'rgba(90,190,255,0)');
      rim.addColorStop(0.45, 'rgba(90,190,255,0.35)');
      rim.addColorStop(1, 'rgba(90,190,255,0)');
      g.fillStyle = rim;
      g.beginPath(); g.arc(pcx, pcy, pr * 1.08, 0, Math.PI * 2); g.fill();
      // small moon
      var mr = pr * 0.09, mx = pcx + pr * 1.35, my = pcy - pr * 0.75;
      var mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 1, mx, my, mr);
      mg.addColorStop(0, '#7f8aa0');
      mg.addColorStop(1, '#1a2030');
      g.fillStyle = mg;
      g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
      // orbital station skyline along the bottom
      g.fillStyle = '#05080f';
      g.beginPath();
      g.moveTo(0, H);
      var x = 0;
      while (x < W) {
        var bw = 20 + Math.random() * 70, bh = H * (0.08 + Math.random() * 0.18);
        g.lineTo(x, H - bh);
        if (Math.random() < 0.3) { g.lineTo(x + bw * 0.45, H - bh - 18); g.lineTo(x + bw * 0.55, H - bh - 18); }
        g.lineTo(x + bw, H - bh);
        x += bw;
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
      // tiny station lights
      for (i = 0; i < 70; i++) {
        g.fillStyle = Math.random() < 0.7 ? 'rgba(255,170,80,0.5)' : 'rgba(120,200,255,0.5)';
        g.fillRect(Math.random() * W, H - Math.random() * H * 0.2, 1.5, 1.5);
      }
      // readability: darken the centre band and the edges
      var vg = g.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.2, W / 2, H * 0.5, M * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0.25)');
      vg.addColorStop(1, 'rgba(0,0,0,0.7)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
      return c;
    },

    // one card: pedestal, accent glow, the real ship idling (and test-firing when selected)
    _drawShipCard: function (cv, ship, idx, selected, dt) {
      var f = this._fitCanvas(cv);
      if (!f) return;
      var ctx = f.ctx, w = f.w, h = f.h, t = this._ssT + idx * 1.3, i;
      ctx.clearRect(0, 0, w, h);
      var S = Math.min(w / 74, h / 66);
      var cx = w / 2, baseY = h * 0.5;    // ship floats above the pedestal

      // accent glow + pedestal
      var gl = ctx.createRadialGradient(cx, baseY, 2, cx, baseY, Math.max(w, h) * 0.55);
      gl.addColorStop(0, hexA(ship.accent, selected ? 0.28 : 0.12));
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(14,30,44,0.9)';
      ctx.beginPath(); ctx.ellipse(cx, h * 0.88, w * 0.3, h * 0.075, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(ship.accent, selected ? 0.6 : 0.25);
      ctx.lineWidth = 1;
      ctx.stroke();

      var W8 = ship.weapon, pv = selected ? this._pv : null;
      var a0 = -Math.PI / 2 + Math.sin(t * 0.7) * 0.04;
      var cy = baseY + Math.sin(t * 1.5) * 2.5;

      // selected ship: slow-motion weapon test (local Projectile objects only)
      if (pv) {
        pv.burst += dt;
        var firing = (pv.burst % 2.6) < 1.6;
        if (W8.spinUp) pv.heat = firing ? Math.min(1, pv.heat + dt / W8.spinUp.time) : Math.max(0, pv.heat - dt * 1.8);
        pv.cd -= dt;
        if (pv.muzzle > 0) pv.muzzle -= dt;
        if (firing && pv.cd <= 0 && pv.shots.length < 40) {
          var base = W8.spinUp ? W8.spinUp.from + (W8.interval - W8.spinUp.from) * pv.heat : W8.interval;
          pv.cd = Math.max(W8.minInterval, base) * 1.6;
          pv.alt = !pv.alt;
          var shots = global.Ships.volley(ship, null, { alt: pv.alt });
          var ca = Math.cos(a0), sa = Math.sin(a0);
          for (i = 0; i < shots.length; i++) {
            var s = shots[i], a = a0 + s.a, spd = W8.speed * 0.16;
            pv.shots.push(new global.Projectile(ca * s.x - sa * s.y, sa * s.x + ca * s.y, Math.cos(a) * spd, Math.sin(a) * spd,
              { type: 'player', pal: ship.palette[1], shape: W8.shape, heavy: W8.heavy, size: W8.size, tier: 1,
                primary: s.primary, lifetime: 9, noEmber: true }));
          }
          pv.muzzle = 0.09 + (W8.heavy ? 0.05 : 0);
        }
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(S, S);
      if (pv) {
        var top = -(cy / S) - 12;
        for (i = pv.shots.length - 1; i >= 0; i--) {
          var q = pv.shots[i];
          q.update(dt);
          if (!q.active || q.y < top || Math.abs(q.x) > w / S) { pv.shots.splice(i, 1); continue; }
          q.draw(ctx);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = selected ? 1 : 0.82;
      ctx.rotate(a0);
      global.Ships.draw(ctx, ship, t, {
        tier: 1, multi: 0, moving: 0.45 + 0.15 * Math.sin(t * 3), flameBoost: selected ? 1.1 : 0.9,
        charge: pv ? pv.heat : 0, muzzle: pv && pv.muzzle > 0 ? Math.min(1, pv.muzzle / 0.09) : 0
      });
      ctx.restore();
    },

    /* ── callsign registration ── */

    /**
     * keepTyped: true only when stepping back from ship selection (same player,
     * same name). A new match always starts with an empty field, so the
     * previous pilot's callsign is never reused by accident.
     */
    openCallsign: function (keepTyped) {
      var LB = global.Leaderboard;
      var inp = document.getElementById('cs-input');
      if (inp) inp.value = keepTyped ? (this._pendingCallsign || '') : '';
      var top = LB.load()[0];
      var tgt = document.getElementById('cs-target');
      if (tgt) {
        tgt.innerHTML = top
          ? 'RECORDE A BATER &nbsp;<b>' + esc(top.name) + '</b> &nbsp;' + fmtScore(top.score)
          : 'O PLACAR ESTÁ VAZIO — SEJA O PRIMEIRO';
      }
      this.show('callsign');
      this._csUpdate();
      if (inp) setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 60);
    },

    _csUpdate: function () {
      var LB = global.Leaderboard;
      var inp = document.getElementById('cs-input');
      if (!inp) return;
      var clean = LB.cleanName(inp.value);
      if (inp.value !== clean) inp.value = clean;
      var focused = document.activeElement === inp;
      var html = '';
      for (var i = 0; i < LB.NAME_MAX; i++) {
        var ch = clean.charAt(i);
        var cls = 'cs-slot' + (i < LB.NAME_MIN ? ' req' : '') + (ch ? ' on' : '') + (focused && i === clean.length ? ' cur' : '');
        html += '<span class="' + cls + '">' + (ch ? esc(ch) : '_') + '</span>';
      }
      var slots = document.getElementById('cs-slots');
      if (slots) slots.innerHTML = html;
      var cnt = document.getElementById('cs-count');
      if (cnt) cnt.textContent = clean.length + '/' + LB.NAME_MAX;
      var ok = LB.validName(clean);
      var go = document.getElementById('cs-go');
      if (go) go.disabled = !ok;
      var hint = document.getElementById('cs-hint');
      if (hint) {
        hint.textContent = ok ? 'CODINOME VÁLIDO' : (clean.length ? 'MÍNIMO DE ' + LB.NAME_MIN + ' CARACTERES' : '3 a 10 caracteres · letras, números, - e _');
        hint.className = ok ? 'ok' : (clean.length ? 'warn' : '');
      }
    },

    confirmCallsign: function () {
      var LB = global.Leaderboard;
      var inp = document.getElementById('cs-input');
      var name = LB.cleanName(inp ? inp.value : '');
      if (!LB.validName(name)) {
        var field = this.root.querySelector('.cs-field');
        if (field) { field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake'); }
        this.game.audio.play('playerHit');
        return;
      }
      LB.saveCallsign(name);
      if (inp) inp.blur();
      this.openShips(name);                  // next step: choose the fighter
    },

    /* ── end-of-run screens ── */

    _fillRun: function (prefix, stats) {
      var set = function (id, v) { var e = document.getElementById(prefix + id); if (e) e.textContent = v; };
      var res = stats.result || { rank: 0 };
      set('-name', stats.name || '---');
      set('-final', fmtScore(stats.score));
      set('-wave', String(stats.wave));
      set('-kills', String(stats.kills));

      var rb = document.getElementById(prefix + '-rank');
      if (rb) {
        rb.className = 'rank-banner ' + (res.rank ? 'r' + res.rank : 'none');
        if (res.rank === 1) {
          rb.innerHTML = trophySVG(1, 'pop') + '<span><b>NOVO RECORDE</b> — 1º LUGAR</span>';
        } else if (res.rank) {
          rb.innerHTML = trophySVG(res.rank, 'pop') + '<span><b>TOP 3</b> — ' + res.rank + 'º LUGAR · ' + MEDAL[res.rank].label + '</span>';
        } else {
          var third = global.Leaderboard.entries[2];
          var miss = third ? third.score - stats.score + 1 : 0;
          rb.innerHTML = '<span>FORA DO TOP 3' + (miss > 0 ? ' · faltaram <b>' + fmtScore(miss) + '</b> pontos' : '') + '</span>';
        }
      }
      var bd = document.getElementById(prefix + '-board');
      if (bd) bd.innerHTML = boardHTML(global.Leaderboard.entries, res.rank ? res.entry.id : null);

      var screen = this.screens[prefix === 'go' ? 'gameover' : 'victory'];
      var panelEl = screen && screen.querySelector('.panel');
      if (panelEl) {
        panelEl.classList.remove('celebrate-1', 'celebrate-2', 'celebrate-3');
        var old = panelEl.querySelector('.confetti');
        if (old) old.parentNode.removeChild(old);
        if (res.rank) {
          void panelEl.offsetWidth;                       // restart the CSS animations
          panelEl.classList.add('celebrate-' + res.rank);
          this._confetti(panelEl, res.rank);
          this.game.audio.play(res.rank === 1 ? 'victory' : 'upgrade');
          if (res.rank === 1) this.game.audio.play('tierUp');
        }
      }
    },

    // restrained confetti: a few CSS-animated pieces, removed after the burst
    _confetti: function (panelEl, rank) {
      var m = MEDAL[rank];
      var box = document.createElement('div');
      box.className = 'confetti';
      var n = rank === 1 ? 26 : 12;
      var cols = [m.a, m.b, m.c, '#00f0ff'];
      for (var i = 0; i < n; i++) {
        var c = document.createElement('i');
        c.style.left = (5 + Math.random() * 90) + '%';
        c.style.background = cols[i % cols.length];
        c.style.animationDelay = (Math.random() * 0.6) + 's';
        c.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
        c.style.setProperty('--drift', (Math.random() * 80 - 40) + 'px');
        c.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
        box.appendChild(c);
      }
      panelEl.appendChild(box);
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 3600);
    },

    showGameOver: function (stats) {
      this._fillRun('go', stats);
      this.show('gameover');
    },

    showVictory: function (stats) {
      this._fillRun('vic', stats);
      this.show('victory');
    },

    /* ───────────────────────── in-game HUD (canvas) ───────────────────────── */

    drawHUD: function (ctx, g) {
      var W = g.width, H = g.height;
      var p = g.player;
      var wm = global.WaveManager;
      var FX = global.PowerUpEffects;
      var dt = g.dt || 0.016;
      var i;

      // low-health vignette (screen space)
      var hpRatio = p.health / p.maxHealth;
      var dmg = g.damageFlash > 0 ? g.damageFlash : 0;
      if (hpRatio < 0.3 || dmg > 0) {
        var a = (hpRatio < 0.3 ? 0.18 + 0.12 * Math.sin(g.time * 6) : 0) + dmg * 0.7;
        var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, 'rgba(255,0,20,0)');
        vg.addColorStop(1, 'rgba(255,0,20,' + Math.min(0.7, a) + ')');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }

      var k = Math.max(0.72, Math.min(1.1, W / 1280));
      var vw = W / k, vh = H / k;
      ctx.save();
      ctx.scale(k, k);

      // ── hull (top-left)
      this._hp += (p.health - this._hp) * Math.min(1, dt * 8);
      panel(ctx, 20, 18, 270, 62);
      text(ctx, 'VIDA', 34, 38, 11, 'rgba(200,224,255,0.65)', 'left', '700', FONT, 3);
      text(ctx, Math.ceil(p.health) + ' / ' + p.maxHealth, 276, 38, 12, '#c8e0ff', 'right', '600', MONO);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(34, 46, 242, 12);
      var hcol = hpRatio > 0.6 ? '#00ff88' : hpRatio > 0.3 ? '#ffcc00' : '#ff2200';
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(34, 46, 242 * Math.max(0, this._hp / p.maxHealth), 12);
      ctx.fillStyle = hcol;
      ctx.fillRect(34, 46, 242 * Math.max(0, hpRatio), 12);
      ctx.fillStyle = 'rgba(4,10,26,0.8)';
      for (i = 1; i < 10; i++) ctx.fillRect(34 + i * 24.2 - 1, 46, 2, 12);
      if (p.isShielded()) {
        ctx.fillStyle = '#44aaff';
        ctx.fillRect(34, 66, 242 * FX.getProgress('SHIELD'), 3);
      }

      // ── score (top-centre)
      var hi = Math.max(g.save.highScore, p.score);
      text(ctx, pad8(p.score), vw / 2, 48, 30, '#ffffff', 'center', '700', MONO, 2);
      text(ctx, 'RECORDE ' + pad8(hi), vw / 2, 68, 11, 'rgba(200,224,255,0.55)', 'center', '600', MONO, 1);

      // ── combo
      if (p.combo !== this._lastCombo) {
        if (p.combo > this._lastCombo) this._comboPop = 1;
        this._lastCombo = p.combo;
      }
      if (this._comboPop > 0) this._comboPop = Math.max(0, this._comboPop - dt * 4);
      if (p.combo >= 2) {
        var sc = 1 + this._comboPop * 0.25;
        ctx.save();
        ctx.translate(vw / 2, 100);
        ctx.scale(sc, sc);
        text(ctx, 'COMBO x' + p.combo, 0, 0, 18, p.multiplier >= 3 ? '#ffaa00' : '#00f0ff', 'center', '700', FONT, 2);
        text(ctx, 'PONTOS x' + p.multiplier.toFixed(1), 0, 18, 12, 'rgba(200,224,255,0.75)', 'center', '600', MONO, 1);
        ctx.restore();
        var cw = 120, cr = Math.max(0, p.comboTimer / p.comboWindow);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(vw / 2 - cw / 2, 126, cw, 3);
        ctx.fillStyle = p.multiplier >= 3 ? '#ffaa00' : '#00f0ff';
        ctx.fillRect(vw / 2 - cw / 2, 126, cw * cr, 3);
      }

      // ── wave (top-right)
      var hostiles = g.enemies.getActiveCount() + (g.bossMgr.isAlive() ? 1 : 0);
      panel(ctx, vw - 190, 18, 170, 62);
      text(ctx, 'ONDA ' + (wm.currentWave < 10 ? '0' : '') + wm.currentWave, vw - 34, 46, 22, '#ffffff', 'right', '700', FONT, 3);
      text(ctx, 'INIMIGOS ' + hostiles, vw - 34, 68, 12, hostiles > 0 ? '#ff9a6c' : 'rgba(200,224,255,0.6)', 'right', '600', MONO, 1);

      // ── active power-ups (bottom-left)
      var row = 0;
      for (i = 0; i < FX_META.length; i++) {
        var m = FX_META[i];
        if (!FX.isActive(m.type)) continue;
        var y = vh - 24 - 34 * (row + 1);
        panel(ctx, 20, y, 178, 28);
        ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.arc(36, y + 14, 5, 0, Math.PI * 2); ctx.fill();
        text(ctx, m.label, 50, y + 18, 11, '#c8e0ff', 'left', '700', FONT, 2);
        text(ctx, FX.getRemainingTime(m.type).toFixed(1) + 's', 188, y + 18, 11, m.color, 'right', '600', MONO);
        ctx.fillStyle = m.color;
        ctx.fillRect(30, y + 24, 158 * FX.getProgress(m.type), 2);
        row++;
      }

      // ── boss health bar (bottom-centre)
      var boss = g.bossMgr.boss;
      if (boss && !boss.finished) {
        var bw = Math.min(700, vw * 0.62), bx = (vw - bw) / 2, by = vh - 56;
        var br = boss.health / boss.maxHealth;
        this._bossHp += (br - this._bossHp) * Math.min(1, dt * 3);
        var bcol = boss.phase === 1 ? '#b84dff' : boss.phase === 2 ? '#ff4dc8' : '#ff3a3a';
        text(ctx, boss.name, bx, by - 8, 13, '#ffffff', 'left', '700', FONT, 4);
        text(ctx, 'FASE ' + boss.phase + ' / 3', bx + bw, by - 8, 12, bcol, 'right', '700', FONT, 3);
        ctx.fillStyle = 'rgba(8,10,26,0.7)';
        ctx.fillRect(bx - 2, by - 2, bw + 4, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(bx, by, bw * Math.max(0, this._bossHp), 14);
        ctx.fillStyle = bcol;
        ctx.fillRect(bx, by, bw * Math.max(0, br), 14);
        ctx.fillStyle = 'rgba(4,10,26,0.9)';
        ctx.fillRect(bx + bw * 0.66 - 1, by, 2, 14);
        ctx.fillRect(bx + bw * 0.33 - 1, by, 2, 14);
      }

      // ── wave announcement / wave cleared / boss banners (centre)
      var ann = wm.waveAnnouncement;
      if (ann.visible) {
        var dur = wm._announcementDuration || 3;
        var al = Math.max(0, Math.min(1, (dur - ann.timer) / 0.4, ann.timer / 0.6));
        var isBoss = wm.currentWave === wm.bossWave;
        var flash = isBoss ? (0.75 + 0.25 * Math.sin(g.time * 14)) : 1;
        text(ctx, ann.text, vw / 2, vh * 0.3, isBoss ? 40 : 46, isBoss ? 'rgba(255,70,70,' + (al * flash) + ')' : 'rgba(255,255,255,' + al + ')', 'center', '700', FONT, 10);
      } else if (wm.isTransitioning && g.state !== global.GAME_STATES.VICTORY) {
        var cleared = wm.currentWave === wm.bossWave ? 'CHEFE DESTRUÍDO' : 'ONDA ' + wm.currentWave + ' CONCLUÍDA';
        text(ctx, cleared, vw / 2, vh * 0.3, 40, '#00f0ff', 'center', '700', FONT, 10);
        text(ctx, 'BÔNUS +' + g.waveBonus, vw / 2, vh * 0.3 + 30, 16, 'rgba(200,224,255,0.8)', 'center', '600', MONO, 2);
      }
      if (g.bannerObj) {
        var b = g.bannerObj;
        var ba = Math.max(0, Math.min(1, b.t / 0.3, (b.dur - b.t) / 0.5));
        ctx.globalAlpha = ba;
        text(ctx, b.text, vw / 2, vh * 0.42, 30, b.color, 'center', '700', FONT, 8);
        ctx.globalAlpha = 1;
      }

      this._drawShipPanel(ctx, g, vw, vh);
      this._drawTop3(ctx, g, vw, vh);
      this._drawNotice(ctx, g, vw, vh);

      ctx.restore();
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      if (g.isDemoMode) this._drawDemoBadge(ctx, g, W, H);

      // ── crosshair (screen space) — in the demo it shows where the CPU aims
      var AM = global.AttractMode;
      var demoAim = g.isDemoMode && AM && AM.ai;
      var aimSrc = demoAim ? AM.ai.input : g.input;
      if (!aimSrc.touch.active && (g.state === global.GAME_STATES.PLAYING || g.state === global.GAME_STATES.BOSS)) {
        var mx = aimSrc.mouse.x, my = aimSrc.mouse.y;
        ctx.save();
        ctx.strokeStyle = demoAim ? 'rgba(255,170,0,0.55)' : 'rgba(0,240,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx - 15, my); ctx.lineTo(mx - 5, my);
        ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 15, my);
        ctx.moveTo(mx, my - 15); ctx.lineTo(mx, my - 5);
        ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 15);
        ctx.stroke();
        ctx.restore();
      }
    },

    /* ── attract mode: "DEMONSTRAÇÃO" pill + blinking prompt + CPU tag ── */
    _drawDemoBadge: function (ctx, g, W, H) {
      var t = g.time, p = g.player;
      var AM = global.AttractMode;
      var k = Math.max(0.72, Math.min(1.1, W / 1280));
      ctx.save();
      ctx.scale(k, k);
      var vw = W / k, vh = H / k;

      // pill under the hull panel (top-left)
      var x = 20, y = 90, w = 214, h = 30;
      roundRect(ctx, x, y, w, h, 15);
      ctx.fillStyle = 'rgba(40,24,0,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,0,' + (0.45 + 0.25 * Math.sin(t * 3)) + ')';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // "recording" style dot
      ctx.fillStyle = Math.floor(t * 2) % 2 ? '#ffaa00' : 'rgba(255,170,0,0.25)';
      ctx.beginPath(); ctx.arc(x + 16, y + h / 2, 4.5, 0, Math.PI * 2); ctx.fill();
      text(ctx, 'DEMONSTRAÇÃO', x + 28, y + 19.5, 12, '#ffcf66', 'left', '800', FONT, 3);
      var st = AM && AM.ai ? AM.ai.status : '';
      text(ctx, 'CPU', x + w - 12, y + 19.5, 9.5, 'rgba(255,207,102,0.7)', 'right', '700', MONO, 2);
      if (st) text(ctx, 'NAVE ' + p.ship.name + ' · ' + st, x + 4, y + h + 14, 9, 'rgba(255,207,102,0.6)', 'left', '700', FONT, 1.5);

      // classic arcade prompt, bottom centre (above the boss bar area)
      var blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 4));
      ctx.globalAlpha = blink;
      text(ctx, 'PRESSIONE QUALQUER TECLA PARA JOGAR', vw / 2, vh - (g.bossMgr.boss && !g.bossMgr.boss.finished ? 96 : 30),
        12, '#ffffff', 'center', '700', FONT, 4);
      ctx.restore();

      // small CPU tag that follows the ship
      if (p.active) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        text(ctx, 'CPU', p.x, p.y + 36, 9, '#ffcf66', 'center', '800', MONO, 2);
        ctx.restore();
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    },

    /* ── ship panel (bottom-right): weapon tier, upgrades, special gauge ── */
    _drawShipPanel: function (ctx, g, vw, vh) {
      var p = g.player;
      var U = global.SHIP_UPGRADES, order = global.SHIP_UPGRADE_ORDER;
      var T = global.Ships.tierStyle(p.ship, p.weaponTier);
      if (!U || !T) return;
      var rows = [], i;
      for (i = 0; i < order.length; i++) if (p.up[order[i]] > 0) rows.push(order[i]);
      var hasSpecial = p.up.SPECIAL > 0;
      var w = 214, x = vw - w - 20;
      var h = 44 + rows.length * 17 + (hasSpecial ? 30 : 0) + (rows.length ? 6 : 0);
      var y = vh - 24 - h;
      panel(ctx, x, y, w, h);

      // weapon tier header with 5 pips
      text(ctx, 'ARMA', x + 14, y + 19, 10, 'rgba(200,224,255,0.6)', 'left', '700', FONT, 3);
      text(ctx, T.name, x + w - 14, y + 19, 12, T.color, 'right', '700', FONT, 2);
      for (i = 0; i < 5; i++) {
        var on = i < p.weaponTier;
        ctx.fillStyle = on ? T.color : 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + 14 + i * 38, y + 27, 34, 5);
      }
      if (p.tierFlash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.tierFlash);
        ctx.strokeStyle = T.color;
        ctx.lineWidth = 2;
        roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 8);
        ctx.stroke();
        ctx.restore();
      }

      // upgrade rows
      var ry = y + 50;
      for (i = 0; i < rows.length; i++) {
        var k = rows[i], m = U[k];
        text(ctx, m.label, x + 14, ry + 9, 9.5, 'rgba(200,224,255,0.8)', 'left', '700', FONT, 1);
        for (var j = 0; j < m.max; j++) {
          ctx.fillStyle = j < p.up[k] ? m.color : 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + w - 14 - (m.max - j) * 11 + 2, ry + 2, 8, 7);
        }
        ry += 17;
      }

      // special weapon gauge
      if (hasSpecial) {
        var cd = p.specialCooldown();
        var ready = p.specialCD <= 0;
        var frac = ready ? 1 : 1 - p.specialCD / cd;
        var gy = y + h - 26;
        var col = '#c58cff';
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 14, gy + 10, w - 28, 6);
        ctx.fillStyle = ready ? col : 'rgba(197,140,255,0.55)';
        ctx.fillRect(x + 14, gy + 10, (w - 28) * frac, 6);
        var lbl = ready ? 'ONDA DE CHOQUE · PRONTA [Q]' : 'ONDA DE CHOQUE · ' + Math.ceil(p.specialCD) + ' s';
        var a = ready ? 0.75 + 0.25 * Math.sin(g.time * 6) : 0.7;
        text(ctx, lbl, x + 14, gy + 4, 9.5, ready ? 'rgba(220,190,255,' + a + ')' : 'rgba(200,224,255,0.6)', 'left', '700', FONT, 1);
      }

      // barrier status
      if (p.up.SHIELD > 0) {
        var bl = p.barrierReady ? 'BARREIRA ATIVA' : 'BARREIRA ' + Math.ceil(Math.max(0, p.barrierT)) + ' s';
        text(ctx, bl, x + w - 14, y - 6, 9.5, p.barrierReady ? '#66b8ff' : 'rgba(200,224,255,0.5)', 'right', '700', FONT, 1);
      }
    },

    /* ── permanent Top 3 board (top-right, under the wave panel) ── */
    _drawTop3: function (ctx, g, vw, vh) {
      var LB = global.Leaderboard;
      if (!LB) return;
      var list = LB.entries, p = g.player, t = g.time, i;
      var compact = vh < 600;
      var w = 196, x = vw - w - 20, y = 90;
      var rowH = compact ? 18 : 22;
      var head = compact ? 26 : 38;
      var h = head + rowH * 3 + (compact ? 24 : 30);

      // never cover the ship: fade while it flies under the board
      var k = Math.max(0.72, Math.min(1.1, g.width / 1280));
      var spx = p.x / k, spy = p.y / k;
      var near = spx > x - 40 && spx < x + w + 40 && spy > y - 40 && spy < y + h + 40;
      ctx.save();
      ctx.globalAlpha = near ? 0.28 : 0.94;

      panel(ctx, x, y, w, h);
      // gold border light, gently breathing
      ctx.save();
      ctx.globalAlpha *= 0.25 + 0.15 * Math.sin(t * 1.6);
      ctx.strokeStyle = MEDAL[1].b;
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
      ctx.stroke();
      ctx.restore();

      // header: trophy + title
      var ts = compact ? 18 : 26;
      drawTrophy(ctx, x + 10, y + (compact ? 4 : 6), ts, MEDAL[1], t);
      text(ctx, 'TOP 3', x + 16 + ts, y + (compact ? 18 : 21), compact ? 12 : 14, '#fff3c4', 'left', '800', FONT, 3);
      if (!compact) text(ctx, 'CODE FIGHTERS · RECORDES', x + 16 + ts, y + 32, 8, 'rgba(200,224,255,0.55)', 'left', '700', FONT, 1.5);

      // rows
      var ry = y + head;
      for (i = 0; i < 3; i++) {
        var e = list[i], m = MEDAL[i + 1], cy = ry + rowH / 2;
        if (i === 0 && e) {
          // first place: warm band + slow shimmer sweep
          ctx.fillStyle = 'rgba(255,200,70,0.10)';
          ctx.fillRect(x + 6, ry + 1, w - 12, rowH - 2);
          var sw = ((t * 0.35) % 1.4) - 0.2;
          if (sw > 0 && sw < 1) {
            var sx = x + 6 + sw * (w - 12);
            var sg = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
            sg.addColorStop(0, 'rgba(255,240,190,0)');
            sg.addColorStop(0.5, 'rgba(255,240,190,0.18)');
            sg.addColorStop(1, 'rgba(255,240,190,0)');
            ctx.fillStyle = sg;
            ctx.fillRect(sx - 30, ry + 1, 60, rowH - 2);
          }
        }
        // medal
        var mr = compact ? 6.5 : 8;
        var mg = ctx.createLinearGradient(0, cy - mr, 0, cy + mr);
        mg.addColorStop(0, e ? m.a : 'rgba(255,255,255,0.18)');
        mg.addColorStop(1, e ? m.c : 'rgba(255,255,255,0.06)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(x + 20, cy, mr, 0, Math.PI * 2); ctx.fill();
        text(ctx, String(i + 1), x + 20, cy + (compact ? 3.5 : 4), compact ? 9 : 10.5, e ? '#1a1206' : 'rgba(200,224,255,0.45)', 'center', '800', FONT);
        if (e) {
          text(ctx, e.name, x + 34, cy + 4, i === 0 ? 12 : 11, i === 0 ? '#ffe9a8' : '#dfe9f7', 'left', '700', FONT, 1);
          text(ctx, fmtScore(e.score), x + w - 12, cy + 4, i === 0 ? 12 : 11, i === 0 ? m.b : '#ffffff', 'right', '700', MONO);
        } else {
          text(ctx, '-- VAZIO --', x + 34, cy + 4, 10, 'rgba(200,224,255,0.35)', 'left', '700', FONT, 1);
          text(ctx, '-----', x + w - 12, cy + 4, 10, 'rgba(200,224,255,0.25)', 'right', '700', MONO);
        }
        ry += rowH;
      }

      // live line: this run against the board
      ctx.fillStyle = 'rgba(120,180,255,0.18)';
      ctx.fillRect(x + 10, ry + 3, w - 20, 1);
      // the demo never competes: no projected rank, just a "CPU" line
      var rank = g.isDemoMode ? 0 : LB.projectedRank(p.score, g.runRecordedId);
      var ly = ry + (compact ? 17 : 21);
      var who = g.isDemoMode ? 'CPU · DEMO' : (g.callsign || 'VOCÊ');
      if (rank) {
        var rm = MEDAL[rank];
        var pulse = 0.75 + 0.25 * Math.sin(t * 5);
        text(ctx, '▶ ' + who, x + 12, ly, 10.5, rm.b, 'left', '800', FONT, 1);
        ctx.globalAlpha *= pulse;
        text(ctx, '#' + rank, x + w - 76, ly, 10.5, rm.b, 'right', '800', MONO);
        ctx.globalAlpha /= pulse;
      } else {
        text(ctx, who, x + 12, ly, 10.5, 'rgba(200,224,255,0.7)', 'left', '700', FONT, 1);
      }
      text(ctx, fmtScore(p.score), x + w - 12, ly, 10.5, rank ? '#ffffff' : 'rgba(200,224,255,0.7)', 'right', '700', MONO);
      ctx.restore();
    },

    /* ── upgrade notification card (bottom-centre, animated) ── */
    _drawNotice: function (ctx, g, vw, vh) {
      var n = g.notices && g.notices[0];
      if (!n) return;
      var t = n.t, inT = 0.28, outT = 0.45;
      var a = Math.max(0, Math.min(1, t / inT, (n.dur - t) / outT));
      var ease = 1 - Math.pow(1 - Math.min(1, t / inT), 3);
      var w = n.big ? 440 : 400, h = n.big ? 78 : 66;
      var x = vw / 2 - w / 2;
      var y = vh - 110 - h + (1 - ease) * 26 - (t > n.dur - outT ? (t - (n.dur - outT)) * 30 : 0);
      var boss = g.bossMgr.boss;
      if (boss && !boss.finished) y -= 34;           // stay clear of the boss bar

      // never hide the action: fade the card while the ship flies near it
      var k = Math.max(0.72, Math.min(1.1, g.width / 1280));
      var spx = g.player.x / k, spy = g.player.y / k;
      if (spx > x - 50 && spx < x + w + 50 && spy > y - 70 && spy < y + h + 50) a *= 0.3;

      ctx.save();
      ctx.globalAlpha = a;
      // card
      roundRect(ctx, x, y, w, h, 8);
      var bg = ctx.createLinearGradient(x, y, x + w, y);
      bg.addColorStop(0, 'rgba(8,20,48,0.88)');
      bg.addColorStop(1, 'rgba(12,28,64,0.78)');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.shadowBlur = 22;
      ctx.shadowColor = n.color;
      ctx.strokeStyle = n.color;
      ctx.lineWidth = n.big ? 2 : 1.4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // accent bar
      ctx.fillStyle = n.color;
      ctx.fillRect(x, y + 8, 4, h - 16);

      // shine sweep
      var sw = ((t * 1.4) % 1.6) - 0.3;
      if (sw > 0 && sw < 1) {
        ctx.save();
        roundRect(ctx, x, y, w, h, 8);
        ctx.clip();
        var sx = x + sw * w;
        var sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)');
        sg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(sx - 60, y, 120, h);
        ctx.restore();
      }

      // text
      text(ctx, n.title, x + 20, y + 20, 10, n.color, 'left', '700', FONT, 4);
      text(ctx, n.name, x + 20, y + (n.big ? 50 : 44), n.big ? 24 : 19, '#ffffff', 'left', '700', FONT, 2);
      if (n.desc) text(ctx, n.desc, x + 20, y + h - 9, 10.5, 'rgba(200,224,255,0.75)', 'left', '600', FONT, 0.5);

      // level pips (pop in one by one)
      if (n.max > 0) {
        var pw = n.big ? 12 : 10, gap = 4;
        var px = x + w - 18 - n.max * (pw + gap) + gap;
        var py = y + 14;
        text(ctx, 'NÍVEL ' + n.lvl + '/' + n.max, x + w - 18, y + h - 9, 10, n.color, 'right', '700', MONO, 1);
        for (var i = 0; i < n.max; i++) {
          var filled = i < n.lvl;
          var popT = Math.max(0, Math.min(1, (t - 0.15 - i * 0.06) / 0.18));
          var s = filled ? (i === n.lvl - 1 ? 1 + 0.5 * (1 - popT) * Math.sin(popT * Math.PI) : 1) : 1;
          ctx.fillStyle = filled ? n.color : 'rgba(255,255,255,0.14)';
          ctx.globalAlpha = a * (filled ? Math.max(0.25, popT) : 1);
          var cx = px + i * (pw + gap) + pw / 2, cy = py + pw / 2;
          ctx.fillRect(cx - (pw / 2) * s, cy - (pw / 2) * s, pw * s, pw * s);
        }
      }
      ctx.restore();
    },

    resetHudState: function () {
      this._hp = this.game.player.maxHealth;
      this._bossHp = 1;
      this._comboPop = 0;
      this._lastCombo = 0;
    }
  };

  global.UIManager = UIManager;
}(typeof window !== 'undefined' ? window : this));
