(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   * GamepadInput — controle do Xbox (e qualquer controle no padrão
   * "standard" da Gamepad API), junto com teclado, mouse e toque.
   *
   * No jogo:   analógico esq. / direcional = mover · analógico dir. = mirar
   *            (empurrar também atira) · RT ou A = atirar · LB, RB ou X =
   *            onda de choque · Start ou View = pausar · vibra ao levar dano
   * Nos menus: direcional / analógico = navegar · A = confirmar · B = voltar
   * Codinome:  ▲▼ trocam a letra · ◀▶ mudam a posição · A confirma
   *
   * O estado vai para game.input.pad; o teclado e o mouse nunca são
   * sobrescritos. Lido uma vez por quadro pelo laço principal do jogo.
   * ═══════════════════════════════════════════════════════════════════════ */

  // botões no mapeamento "standard" (Xbox)
  var B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  var DEAD = 0.22;            // zona morta dos analógicos
  var AIM_DIST = 150;         // distância da mira na tela
  var REPEAT_DELAY = 0.38, REPEAT_RATE = 0.11;
  var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';

  function stick(x, y) {
    var m = Math.sqrt(x * x + y * y);
    if (m < DEAD) return { x: 0, y: 0, m: 0 };
    var k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;   // zona morta radial, saída 0..1
    return { x: x * k, y: y * k, m: Math.min(1, (m - DEAD) / (1 - DEAD)) };
  }

  var GamepadInput = {
    game: null,
    connected: false,
    source: 'mouse',          // último dispositivo usado para mirar: 'mouse' | 'pad'
    _prev: [],
    _held: {},                // botão pressionado que já foi "consumido" (até soltar)
    _rep: { dir: null, t: 0 },
    _aimX: 0, _aimY: -1,
    _focusIdx: -1,

    init: function (game) {
      this.game = game;
      game.input.pad = { move: { x: 0, y: 0 }, fire: false, special: false, active: false };
      var self = this;
      if (!navigator.getGamepads) return;     // navegador sem suporte: só teclado e mouse
      global.addEventListener('gamepadconnected', function (e) {
        self.connected = true;
        self._toast('CONTROLE CONECTADO');
        self.rumble(0.25, 0.25, 120);
        void e;
      });
      global.addEventListener('gamepaddisconnected', function () {
        self.connected = !!self._pad();
        if (!self.connected) {
          self._release();
          self._toast('CONTROLE DESCONECTADO');
          // perdeu o controle no meio da partida: pausa, como no console
          if (self.game.isGameplay() && !self.game.isDemoMode) self.game.pause();
        }
      });
      // mexeu o mouse: a mira volta a seguir o cursor
      global.addEventListener('mousemove', function () { self.source = 'mouse'; });
    },

    // body.has-pad mostra as dicas do controle nas telas
    _mark: function (on) {
      if (this._marked === on) return;
      this._marked = on;
      document.body.classList.toggle('has-pad', on);
    },

    _pad: function () {
      var list = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p && p.connected && p.buttons && p.buttons.length >= 16) return p;
      }
      return null;
    },

    _release: function () {
      var P = this.game.input.pad;
      P.move.x = P.move.y = 0;
      P.fire = P.special = P.active = false;
      this._prev = [];
      this._held = {};
    },

    /** Chamado a cada quadro pelo laço principal. */
    update: function (dt) {
      var pad = this._pad();
      var g = this.game, P = g.input.pad;
      if (!pad) { if (P.active) this._release(); this._mark(false); return; }
      this.connected = true;
      this._mark(true);

      var btn = [], i;
      for (i = 0; i < pad.buttons.length; i++) {
        var b = pad.buttons[i];
        btn[i] = typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5;
      }
      var L = stick(pad.axes[0] || 0, pad.axes[1] || 0);
      var R = stick(pad.axes[2] || 0, pad.axes[3] || 0);
      var prev = this._prev;
      var pressed = function (k) { return btn[k] && !prev[k]; };
      var anyPress = false, anyHeld = L.m > 0 || R.m > 0;
      for (i = 0; i < btn.length; i++) { if (btn[i]) anyHeld = true; if (btn[i] && !prev[i]) anyPress = true; }
      for (var k in this._held) if (!btn[k]) delete this._held[k];

      // modo demonstração / tela parada: qualquer uso do controle conta como atividade
      var AM = global.AttractMode;
      if (AM && (anyPress || L.m > 0.5 || R.m > 0.5)) {
        if (AM.isActive()) {
          AM._onActivity(null, false);           // encerra a demonstração
          for (i = 0; i < btn.length; i++) if (btn[i]) this._held[i] = true;   // esse toque não faz mais nada
          this._prev = btn;
          this._rep.dir = 'block';
          return;
        }
        AM.idleT = 0;
      }
      if (anyPress) { try { g.audio.init(); g.audio.music.unlock(); } catch (e) { /* sem áudio ainda */ } }

      var gameplay = g.isGameplay() && !g.isDemoMode;

      // ── jogo
      var dpx = (btn[B.RIGHT] ? 1 : 0) - (btn[B.LEFT] ? 1 : 0);
      var dpy = (btn[B.DOWN] ? 1 : 0) - (btn[B.UP] ? 1 : 0);
      if (gameplay) {
        var mx = L.x, my = L.y;
        if (!L.m && (dpx || dpy)) { var dl = Math.sqrt(dpx * dpx + dpy * dpy); mx = dpx / dl; my = dpy / dl; }
        P.move.x = mx; P.move.y = my;
        if (R.m > 0) { this._aimX = R.x / R.m; this._aimY = R.y / R.m; this.source = 'pad'; }
        var free = function (k) { return btn[k] && !this._held[k]; }.bind(this);
        P.fire = free(B.RT) || free(B.A) || R.m > 0.55;
        P.special = free(B.LB) || free(B.RB) || free(B.X);
        if (!P.active) {
          // entrou na partida: nenhum botão de menu fica com o foco
          var ae = document.activeElement;
          if (ae && ae !== document.body && ae.blur) ae.blur();
          var pf = document.querySelectorAll('.pad-focus');
          for (i = 0; i < pf.length; i++) pf[i].classList.remove('pad-focus');
        }
        P.active = true;
        // a mira do controle vira um ponto na frente da nave: o resto do jogo não muda
        if (this.source === 'pad') {
          g.input.mouse.x = g.player.x + this._aimX * AIM_DIST;
          g.input.mouse.y = g.player.y + this._aimY * AIM_DIST;
        }
        if (pressed(B.START) || pressed(B.VIEW)) { this._held[B.START] = this._held[B.VIEW] = true; g.pause(); }
      } else {
        P.move.x = P.move.y = 0;
        P.fire = P.special = false;
        P.active = false;
        this._menu(btn, pressed, L, dpx, dpy, dt);
      }
      this._prev = btn;
    },

    /* ───────── menus ───────── */

    // direção com repetição automática ao segurar
    _dir: function (L, dpx, dpy, dt) {
      var d = null;
      if (dpy < 0 || L.y < -0.6) d = 'up';
      else if (dpy > 0 || L.y > 0.6) d = 'down';
      else if (dpx < 0 || L.x < -0.6) d = 'left';
      else if (dpx > 0 || L.x > 0.6) d = 'right';
      var R = this._rep;
      if (R.dir === 'block') { if (!d) R.dir = null; return null; }
      if (d !== R.dir) { R.dir = d; R.t = REPEAT_DELAY; return d; }
      if (!d) return null;
      R.t -= dt;
      if (R.t <= 0) { R.t = REPEAT_RATE; return d; }
      return null;
    },

    _menu: function (btn, pressed, L, dpx, dpy, dt) {
      var g = this.game, UI = global.UIManager;
      var dir = this._dir(L, dpx, dpy, dt);
      var a = pressed(B.A) && !this._held[B.A];
      var back = pressed(B.B) && !this._held[B.B];
      var start = pressed(B.START) && !this._held[B.START];
      if (a) this._held[B.A] = true;
      if (back) this._held[B.B] = true;
      if (start) this._held[B.START] = true;
      if (!dir && !a && !back && !start) return;
      var cur = UI.current;

      if (g.state === global.GAME_STATES.PAUSED && (start || back)) { g.resume(); return; }

      if (cur === 'callsign') { this._callsign(dir, a || start, back); return; }

      if (cur === 'ships') {
        if (dir === 'left' || dir === 'up') UI._selectShip(UI._shipIdx - 1);
        else if (dir === 'right' || dir === 'down') UI._selectShip(UI._shipIdx + 1);
        if (a || start) { g.audio.play('menuClick'); UI.confirmShip(); }
        if (back) { g.audio.play('menuClick'); UI.openCallsign(true); }
        return;
      }

      // demais telas: foco linear entre os botões visíveis
      var screen = cur && UI.screens[cur];
      if (!screen) return;
      var items = [].slice.call(screen.querySelectorAll('button:not([disabled]), input[type=range]'))
        .filter(function (el) { return el.offsetParent !== null; });
      if (!items.length) return;
      var idx = items.indexOf(document.activeElement);
      if (idx < 0) idx = items.indexOf(screen.querySelector('.pad-focus'));
      var el = items[idx];

      if (dir) {
        if (el && el.type === 'range' && (dir === 'left' || dir === 'right')) {
          el.value = Math.max(0, Math.min(100, Number(el.value) + (dir === 'right' ? 5 : -5)));
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          var step = dir === 'up' || dir === 'left' ? -1 : 1;
          idx = idx < 0 ? 0 : (idx + step + items.length) % items.length;
          this._focus(items[idx]);
          g.audio.play('menuHover');
        }
      }
      if (a || start) {
        if (!el) { this._focus(items[0]); return; }
        if (el.type !== 'range') el.click();
      }
      if (back) {
        if (cur === 'main') return;
        g.audio.play('menuClick');
        if (cur === 'gameover' || cur === 'victory') return;   // escolha explícita: REINICIAR ou MENU
        g.handleEscape();
      }
    },

    _focus: function (el) {
      var old = document.querySelectorAll('.pad-focus');
      for (var i = 0; i < old.length; i++) old[i].classList.remove('pad-focus');
      if (!el) return;
      el.classList.add('pad-focus');
      try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); }
    },

    /* ───────── codinome estilo fliperama ───────── */
    _callsign: function (dir, confirm, back) {
      var UI = global.UIManager, LB = global.Leaderboard, g = this.game;
      var inp = document.getElementById('cs-input');
      if (!inp) return;
      var chars = LB.cleanName(inp.value).split('');
      if (UI._csPadPos === null || UI._csPadPos === undefined) UI._csPadPos = Math.min(chars.length, LB.NAME_MAX - 1);
      var pos = UI._csPadPos;

      if (dir === 'up' || dir === 'down') {
        var cur = chars[pos];
        var ci = cur ? CHARS.indexOf(cur) : -1;
        ci = ci < 0 ? (dir === 'up' ? 0 : CHARS.length - 1) : (ci + (dir === 'up' ? 1 : -1) + CHARS.length) % CHARS.length;
        while (chars.length < pos) chars.push('A');
        chars[pos] = CHARS.charAt(ci);
        g.audio.play('menuHover');
      } else if (dir === 'right') {
        if (chars[pos] && pos < LB.NAME_MAX - 1) pos++;
      } else if (dir === 'left') {
        if (pos > 0) pos--;
      }
      if (back) {
        if (!chars.length) { UI._csPadPos = null; UI.show('main'); return; }
        chars.splice(Math.min(pos, chars.length - 1), 1);     // apaga a letra
        pos = Math.min(pos, chars.length);
      }
      inp.value = chars.join('');
      UI._csPadPos = pos;
      UI._csUpdate();
      if (confirm) {
        if (LB.validName(inp.value)) { UI._csPadPos = null; UI.confirmCallsign(); }
        else if (chars[pos] && pos < LB.NAME_MAX - 1) { UI._csPadPos = pos + 1; UI._csUpdate(); }
        else UI.confirmCallsign();      // ainda curto: o campo treme avisando
      }
    },

    /* ───────── vibração ───────── */
    rumble: function (strong, weak, ms) {
      var pad = this._pad();
      var act = pad && pad.vibrationActuator;
      if (!act || !act.playEffect) return;
      try {
        act.playEffect('dual-rumble', { startDelay: 0, duration: ms || 150, strongMagnitude: strong || 0.5, weakMagnitude: weak || 0.5 });
      } catch (e) { /* controle sem vibração */ }
    },

    _toast: function (text) {
      var t = document.getElementById('pad-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'pad-toast';
        t.setAttribute('role', 'status');
        document.body.appendChild(t);
      }
      t.textContent = '🎮 ' + text;
      t.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(function () { t.classList.remove('show'); }, 2400);
    }
  };

  global.GamepadInput = GamepadInput;
}(typeof window !== 'undefined' ? window : this));
