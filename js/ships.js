(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   * SHIPS — the four playable fighters, described as data.
   *
   * One generic renderer (Ships.draw) paints any ship from its hull data,
   * so the same code is used in gameplay, the main menu and the ship
   * selection preview. Weapons are configurations consumed by the existing
   * Player.fire() -> ProjectileManager path (no separate weapon engine).
   *
   * Local ship space: nose points to +x, wings along ±y, ~±22 units.
   * Balance reference: the original ship did ~59 DPS (10 dmg / 0.17 s).
   * ═══════════════════════════════════════════════════════════════════════ */

  function pal(rows) {
    var out = [null];
    for (var i = 0; i < rows.length; i++) out.push({ color: rows[i][0], core: rows[i][1], halo: rows[i][2] });
    return out;
  }

  var LIST = [
    /* ───────────── 01 INTERCEPTOR — agile rapid twin fire ───────────── */
    {
      id: 'interceptor', num: '01', name: 'INTERCEPTOR',
      role: 'CAÇA ÁGIL DE TIRO RÁPIDO', cls: 'INTERCEPTADOR', tag: 'Ágil, tiro duplo rápido',
      desc: 'Leve, rápido e muito manobrável. Os canhões gêmeos despejam rajadas de energia azul — perfeito para quem não para de se mover.',
      weaponName: 'CANHÕES GÊMEOS', weaponDesc: '2 disparos paralelos · cadência muito alta · dano baixo por tiro',
      accent: '#00e5ff',
      stats: { damage: 2, fireRate: 5, speed: 5, maneuver: 5 },
      move: { speed: 1.16, accel: 12.5 },
      radius: 14,
      ai: { range: 210, strafe: 95, lead: 1 },
      weapon: {
        damage: 4.4, interval: 0.13, minInterval: 0.06, speed: 860, size: 7,
        shape: 'bolt', sfx: 'twin', altExtras: true,
        pattern: [{ x: 16, y: -6, a: 0 }, { x: 16, y: 6, a: 0 }],
        aux1: [{ x: 3, y: -12, a: 0, f: 0.4 }, { x: 3, y: 12, a: 0, f: 0.4 }],
        aux2: [{ x: -2, y: -15, a: -0.24, f: 0.3 }, { x: -2, y: 15, a: 0.24, f: 0.3 }],
        multiShot: [{ x: 18, y: 0, a: -0.16, f: 1 }, { x: 18, y: 0, a: 0.16, f: 1 }]
      },
      palette: pal([
        ['#00f0ff', '#ffffff', '#00b4ff'], ['#5ffbff', '#ffffff', '#00d0ff'], ['#3d9bff', '#e8fbff', '#00e5ff'],
        ['#9fe8ff', '#ffffff', '#2f6bff'], ['#ffd34d', '#fffbe8', '#ff9f2b']
      ]),
      hull: {
        path: [[25, 0], [9, -3], [1, -5], [-5, -13], [-12, -15], [-9, -5], [-14, -3], [-14, 3], [-9, 5], [-12, 15], [-5, 13], [1, 5], [9, 3]],
        colors: ['#16263f', '#3d6aa6', '#9fd4ff'], edge: 'rgba(170,235,255,0.9)', glow: 'rgba(0,220,255,0.6)',
        metal: '#25406a',
        barrels: [[-1, -6, 15, 2.4], [-1, 6, 15, 2.4]],
        engines: [{ x: -14, y: 0, w: 3.6, len: 1 }],
        flame: ['rgba(160,240,255,0.95)', 'rgba(0,160,255,0.55)', 'rgba(0,80,255,0)'], exhaust: '#00d8ff',
        panel: [[-9, -5, 8, -2], [-9, 5, 8, 2]],
        accents: [[-5, -13, 3, -6], [-5, 13, 3, 6]],
        fins: [[-12, -15, -20, -20, -9, -12], [-12, 15, -20, 20, -9, 12]],
        lights: [[-11, -14, '#ff5a3c'], [-11, 14, '#50ffaa']],
        cockpit: { x: 8, y: 0, rx: 5.5, ry: 2.4, c: ['#ffffff', '#4fe3ff', '#0a5a8a'] }
      }
    },

    /* ───────────── 02 STRIKER — heavy plasma cannon ───────────── */
    {
      id: 'striker', num: '02', name: 'STRIKER',
      role: 'CAÇA PESADO DE ALTO DANO', cls: 'PESADO', tag: 'Blindado, plasma devastador',
      desc: 'Blindado e pesado. O canhão central dispara orbes de plasma devastadores, lentos mas precisos — cada acerto conta.',
      weaponName: 'CANHÃO DE PLASMA', weaponDesc: '1 orbe de plasma · cadência baixa · dano alto por tiro',
      accent: '#ff7a3d',
      stats: { damage: 5, fireRate: 2, speed: 2, maneuver: 2 },
      move: { speed: 0.88, accel: 6.5 },
      radius: 16,
      ai: { range: 300, strafe: 55, lead: 1 },
      weapon: {
        damage: 24, interval: 0.36, minInterval: 0.15, speed: 640, size: 10,
        shape: 'plasma', sfx: 'heavy', heavy: true, altExtras: false,
        pattern: [{ x: 27, y: 0, a: 0 }],
        // aux cannons are a share of one huge plasma shot: kept lower for balance
        aux1: [{ x: 8, y: -13, a: 0, f: 0.25 }, { x: 8, y: 13, a: 0, f: 0.25 }],
        aux2: [{ x: 2, y: -17, a: -0.2, f: 0.2 }, { x: 2, y: 17, a: 0.2, f: 0.2 }],
        multiShot: [{ x: 24, y: 0, a: -0.16, f: 1 }, { x: 24, y: 0, a: 0.16, f: 1 }]
      },
      palette: pal([
        ['#ff8a3d', '#fff3e0', '#ff5a1f'], ['#ff9a4a', '#fff6e8', '#ff4a1a'], ['#ff6a3a', '#fff0d8', '#ff2a2a'],
        ['#ffb35a', '#ffffff', '#ff2a5a'], ['#fff0a0', '#ffffff', '#ff5a00']
      ]),
      hull: {
        path: [[20, 0], [15, -6], [7, -8], [3, -18], [-6, -20], [-11, -11], [-17, -10], [-17, 10], [-11, 11], [-6, 20], [3, 18], [7, 8], [15, 6]],
        colors: ['#2a1712', '#7a3a22', '#d98a5a'], edge: 'rgba(255,200,150,0.9)', glow: 'rgba(255,110,40,0.55)',
        metal: '#4a2a20',
        barrels: [[4, 0, 27, 5]],
        engines: [{ x: -17, y: -6, w: 3.6, len: 0.9 }, { x: -17, y: 6, w: 3.6, len: 0.9 }],
        flame: ['rgba(255,230,180,0.95)', 'rgba(255,120,30,0.6)', 'rgba(255,40,0,0)'], exhaust: '#ff8a3d',
        panel: [[-11, -11, 7, -6], [-11, 11, 7, 6], [-4, -18, 2, -9], [-4, 18, 2, 9]],
        accents: [[-12, 0, 2, 0], [-6, -15, 4, -12], [-6, 15, 4, 12]],
        fins: [[-6, -20, -15, -25, -11, -14], [-6, 20, -15, 25, -11, 14]],
        lights: [[-9, -18, '#ff5a3c'], [-9, 18, '#ffd24a']],
        cockpit: { x: 1, y: 0, rx: 4.5, ry: 3.4, c: ['#fff4e0', '#ffb070', '#7a2a10'] },
        decor: 'armor'
      }
    },

    /* ───────────── 03 SPECTRE — three-way spread ───────────── */
    {
      id: 'spectre', num: '03', name: 'SPECTRE',
      role: 'CONTROLE DE MULTIDÃO', cls: 'CONTROLE', tag: 'Leque triplo contra grupos',
      desc: 'Asas invertidas e três emissores. O leque de energia roxa varre grupos inteiros, mas cada fragmento causa pouco dano.',
      weaponName: 'LEQUE TRIPLO', weaponDesc: '3 trajetórias em leque · cadência média · dano baixo por fragmento',
      accent: '#b57bff',
      stats: { damage: 2, fireRate: 3, speed: 3, maneuver: 4 },
      move: { speed: 1.0, accel: 10 },
      radius: 15,
      ai: { range: 190, strafe: 70, lead: 0.6 },
      weapon: {
        damage: 5, interval: 0.22, minInterval: 0.09, speed: 760, size: 7,
        shape: 'shard', sfx: 'spread', altExtras: false,
        pattern: [{ x: 19, y: 0, a: 0 }, { x: 13, y: -15, a: -0.26 }, { x: 13, y: 15, a: 0.26 }],
        aux1: [{ x: 6, y: -9, a: -0.12, f: 0.4 }, { x: 6, y: 9, a: 0.12, f: 0.4 }],
        aux2: [{ x: 2, y: -17, a: -0.5, f: 0.3 }, { x: 2, y: 17, a: 0.5, f: 0.3 }],
        multiShot: [{ x: 13, y: -15, a: -0.44, f: 1 }, { x: 13, y: 15, a: 0.44, f: 1 }]
      },
      palette: pal([
        ['#b57bff', '#f3e8ff', '#8a4dff'], ['#c690ff', '#ffffff', '#9a5aff'], ['#d27bff', '#ffffff', '#6a3cff'],
        ['#e6a8ff', '#ffffff', '#b03cff'], ['#ffd6ff', '#ffffff', '#ff4dd8']
      ]),
      hull: {
        path: [[18, 0], [7, -4], [12, -15], [4, -19], [-5, -9], [-14, -7], [-10, 0], [-14, 7], [-5, 9], [4, 19], [12, 15], [7, 4]],
        colors: ['#1a1230', '#4b2d7a', '#c9a6ff'], edge: 'rgba(225,200,255,0.9)', glow: 'rgba(170,90,255,0.6)',
        metal: '#3a2660',
        barrels: [[9, -15, 14, 2], [9, 15, 14, 2], [12, 0, 19, 2]],
        engines: [{ x: -11, y: 0, w: 5, len: 0.85 }],
        flame: ['rgba(240,220,255,0.95)', 'rgba(170,90,255,0.6)', 'rgba(110,40,255,0)'], exhaust: '#b57bff',
        panel: [[-5, -9, 6, -3], [-5, 9, 6, 3], [4, -17, 8, -6], [4, 17, 8, 6]],
        accents: [[-14, -7, -6, -3], [-14, 7, -6, 3], [9, -15, 4, -6], [9, 15, 4, 6]],
        fins: [[4, -19, -3, -25, -3, -14], [4, 19, -3, 25, -3, 14]],
        lights: [[3, -18, '#ff7ae0'], [3, 18, '#7affea']],
        cockpit: { x: 4, y: 0, rx: 4.2, ry: 2.6, c: ['#ffffff', '#d7a6ff', '#4a1a8a'] }
      }
    },

    /* ───────────── 04 NOVA — sustained energy lance ───────────── */
    {
      id: 'nova', num: '04', name: 'NOVA',
      role: 'DANO DE ENERGIA CONTÍNUO', cls: 'ENERGIA', tag: 'Feixe que acelera ao aquecer',
      desc: 'Núcleo de fusão e projetor de feixe. Ao segurar o gatilho o reator aquece e o feixe verde fica cada vez mais rápido.',
      weaponName: 'LANÇA DE ENERGIA', weaponDesc: 'Feixe contínuo que acelera ao aquecer · dano sustentado',
      accent: '#4dff9a',
      stats: { damage: 3, fireRate: 4, speed: 3, maneuver: 3 },
      move: { speed: 1.02, accel: 9 },
      radius: 15,
      ai: { range: 240, strafe: 65, lead: 1 },
      weapon: {
        damage: 4, interval: 0.07, minInterval: 0.045, speed: 1250, size: 6,
        shape: 'lance', sfx: 'beam', altExtras: true,
        spinUp: { from: 0.17, time: 0.6 },          // reactor heat-up
        pattern: [{ x: 24, y: 0, a: 0 }],
        aux1: [{ x: 6, y: -11, a: 0, f: 0.4 }, { x: 6, y: 11, a: 0, f: 0.4 }],
        aux2: [{ x: 0, y: -15, a: -0.22, f: 0.3 }, { x: 0, y: 15, a: 0.22, f: 0.3 }],
        multiShot: [{ x: 22, y: 0, a: -0.16, f: 1 }, { x: 22, y: 0, a: 0.16, f: 1 }]
      },
      palette: pal([
        ['#4dff9a', '#eafff2', '#00d07a'], ['#6dffb0', '#ffffff', '#00e08a'], ['#3dffd0', '#ffffff', '#00c0a0'],
        ['#b8ff6a', '#ffffff', '#2aff8a'], ['#eaffb0', '#ffffff', '#7aff2a']
      ]),
      hull: {
        path: [[21, 0], [10, -4], [0, -5], [-6, -15], [-13, -16], [-9, -5], [-13, 0], [-9, 5], [-13, 16], [-6, 15], [0, 5], [10, 4]],
        colors: ['#0d241d', '#27705a', '#9ff5d0'], edge: 'rgba(180,255,220,0.9)', glow: 'rgba(60,255,170,0.55)',
        metal: '#1d4a3c',
        barrels: [[8, -3, 21, 1.6], [8, 3, 21, 1.6]],
        engines: [{ x: -10, y: -10, w: 3, len: 0.8 }, { x: -12, y: 0, w: 3, len: 0.9 }, { x: -10, y: 10, w: 3, len: 0.8 }],
        flame: ['rgba(220,255,230,0.95)', 'rgba(60,255,150,0.55)', 'rgba(0,160,90,0)'], exhaust: '#4dff9a',
        panel: [[-9, -5, 6, -2.5], [-9, 5, 6, 2.5]],
        accents: [[-6, -15, 0, -6], [-6, 15, 0, 6], [10, -4, 18, -1], [10, 4, 18, 1]],
        fins: [[-13, -16, -21, -18, -9, -10], [-13, 16, -21, 18, -9, 10]],
        lights: [[-11, -15, '#7affc0'], [-11, 15, '#7affc0']],
        cockpit: { x: 12, y: 0, rx: 3.4, ry: 1.8, c: ['#ffffff', '#9fffd8', '#0a5a40'] },
        decor: 'core'
      }
    }
  ];

  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  /* ═════════════════════════════ weapon volley ═════════════════════════════ */

  /**
   * Shots of one trigger pull, in ship-local space: [{x, y, a, f, primary}].
   * up      — player upgrade levels (MULTI used here)
   * opts    — { multiShot: power-up active, alt: odd volley (for altExtras) }
   * Ships with very high cadence (altExtras) fire their extra cannons only on
   * every other volley at double strength: same DPS, half the projectiles.
   */
  function volley(ship, up, opts) {
    var w = ship.weapon, out = [], i, s;
    opts = opts || {};
    for (i = 0; i < w.pattern.length; i++) {
      s = w.pattern[i];
      out.push({ x: s.x, y: s.y, a: s.a, f: 1, primary: i === 0 || s.a === 0 });
    }
    var extrasNow = !w.altExtras || opts.alt;
    var boost = w.altExtras ? 2 : 1;
    if (extrasNow) {
      var extra = [];
      if (opts.multiShot) extra = extra.concat(w.multiShot);
      if (up && up.MULTI >= 1) extra = extra.concat(w.aux1);
      if (up && up.MULTI >= 2) extra = extra.concat(w.aux2);
      for (i = 0; i < extra.length; i++) {
        s = extra[i];
        out.push({ x: s.x, y: s.y, a: s.a, f: (s.f || 1) * boost, primary: false });
      }
    }
    return out;
  }

  /* ═════════════════════════════ rendering ═════════════════════════════ */

  function hullPath(ship) {
    if (ship._path) return ship._path;
    var p = ship.hull.path;
    if (typeof Path2D === 'function') {
      var path = new Path2D();
      path.moveTo(p[0][0], p[0][1]);
      for (var i = 1; i < p.length; i++) path.lineTo(p[i][0], p[i][1]);
      path.closePath();
      ship._path = path;
    }
    return ship._path;
  }

  function strokeSegs(ctx, segs) {
    ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      ctx.moveTo(segs[i][0], segs[i][1]);
      ctx.lineTo(segs[i][2], segs[i][3]);
    }
    ctx.stroke();
  }

  /**
   * Draws a ship in local space (ctx already translated/rotated, nose = +x).
   * s: { tier, multi, moving (0..1), hitFlash, tierFlash, muzzle (0..1),
   *      charge (0..1, Nova heat), flameBoost }
   */
  function draw(ctx, ship, t, s) {
    var H = ship.hull, path = hullPath(ship);
    var tier = s.tier || 1, tcol = ship.palette[tier].color;
    var pulse = 0.5 + 0.5 * Math.sin(t * 6);
    var i, e;
    if (!path) return;

    // engine flames
    for (i = 0; i < H.engines.length; i++) {
      e = H.engines[i];
      var flame = (8 + (s.moving || 0) * 15 + Math.random() * 4) * (e.len || 1) * (s.flameBoost || 1);
      var fg = ctx.createLinearGradient(e.x, 0, e.x - flame, 0);
      fg.addColorStop(0, H.flame[0]);
      fg.addColorStop(0.5, H.flame[1]);
      fg.addColorStop(1, H.flame[2]);
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(e.x + 1, e.y - e.w);
      ctx.lineTo(e.x - flame, e.y);
      ctx.lineTo(e.x + 1, e.y + e.w);
      ctx.closePath();
      ctx.fill();
    }

    // auxiliary cannons (MULTI upgrade) sit under the wings
    if (s.multi >= 1) {
      ctx.fillStyle = H.metal;
      ctx.strokeStyle = H.edge;
      ctx.lineWidth = 0.8;
      var mounts = ship.weapon.aux1.concat(s.multi >= 2 ? ship.weapon.aux2 : []);
      for (i = 0; i < mounts.length; i++) {
        var m = mounts[i];
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.a || 0);
        ctx.fillRect(-11, -1.4, 12, 2.8);
        ctx.strokeRect(-11, -1.4, 12, 2.8);
        ctx.restore();
      }
    }

    // hull
    ctx.shadowBlur = 14;
    ctx.shadowColor = H.glow;
    var hg = ctx.createLinearGradient(-17, 0, 24, 0);
    hg.addColorStop(0, H.colors[0]);
    hg.addColorStop(0.6, H.colors[1]);
    hg.addColorStop(1, H.colors[2]);
    ctx.fillStyle = hg;
    ctx.fill(path);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = H.edge;
    ctx.lineWidth = 1.2;
    ctx.stroke(path);

    // ship-specific structure
    if (H.decor === 'armor') {
      // Striker: layered armour plates over the wings
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeStyle = 'rgba(255,200,150,0.35)';
      ctx.lineWidth = 0.8;
      for (var sg = -1; sg <= 1; sg += 2) {
        ctx.beginPath();
        ctx.moveTo(-9, sg * 11); ctx.lineTo(1, sg * 9); ctx.lineTo(-2, sg * 17); ctx.lineTo(-7, sg * 18);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    } else if (H.decor === 'core') {
      // Nova: fusion ring around the reactor, glowing with the weapon colour
      var cr = 6.5;
      ctx.save();
      ctx.strokeStyle = H.metal;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-1, 0, cr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = tcol;
      ctx.globalAlpha *= 0.55 + 0.35 * Math.sin(t * 4) + (s.charge || 0) * 0.3;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(-1, 0, cr, t * 3, t * 3 + 4.4); ctx.stroke();
      var og = ctx.createRadialGradient(-1, 0, 0, -1, 0, 4);
      og.addColorStop(0, '#ffffff');
      og.addColorStop(0.5, tcol);
      og.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(-1, 0, 4 + (s.charge || 0) * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // weapon barrels
    ctx.fillStyle = H.metal;
    ctx.strokeStyle = H.edge;
    ctx.lineWidth = 0.8;
    for (i = 0; i < H.barrels.length; i++) {
      var b = H.barrels[i];
      ctx.fillRect(b[0], b[1] - b[3] / 2, b[2] - b[0], b[3]);
      ctx.strokeRect(b[0], b[1] - b[3] / 2, b[2] - b[0], b[3]);
      ctx.fillStyle = tcol;
      ctx.globalAlpha *= 0.8;
      ctx.fillRect(b[2] - 2, b[1] - b[3] / 2, 2, b[3]);
      ctx.globalAlpha /= 0.8;
      ctx.fillStyle = H.metal;
    }

    // panel lines + navigation lights
    ctx.strokeStyle = 'rgba(10,20,40,0.55)';
    ctx.lineWidth = 1;
    strokeSegs(ctx, H.panel);
    for (i = 0; i < H.lights.length; i++) {
      var L = H.lights[i];
      ctx.fillStyle = L[2];
      ctx.globalAlpha *= 0.55 + 0.45 * (i % 2 ? 1 - pulse : pulse);
      ctx.beginPath(); ctx.arc(L[0], L[1], 1.6, 0, 6.2832); ctx.fill();
      ctx.globalAlpha /= 0.55 + 0.45 * (i % 2 ? 1 - pulse : pulse);
    }

    // visible evolution with the weapon tier
    if (tier >= 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = tcol;
      ctx.globalAlpha *= 0.45 + 0.35 * pulse;
      ctx.lineWidth = tier >= 4 ? 1.6 : 1.1;
      strokeSegs(ctx, H.panel);
      if (tier >= 3) strokeSegs(ctx, H.accents);
      ctx.restore();
    }
    if (tier >= 4) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = tcol;
      ctx.globalAlpha *= 0.5 + 0.3 * Math.sin(t * 9);
      ctx.beginPath();
      for (i = 0; i < H.fins.length; i++) {
        var F = H.fins[i];
        ctx.moveTo(F[0], F[1]); ctx.lineTo(F[2], F[3]); ctx.lineTo(F[4], F[5]); ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }

    // cockpit
    var C = H.cockpit;
    var cg = ctx.createRadialGradient(C.x, C.y - 1, 0.5, C.x, C.y, C.rx);
    cg.addColorStop(0, C.c[0]);
    cg.addColorStop(0.5, C.c[1]);
    cg.addColorStop(1, C.c[2]);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(C.x, C.y, C.rx, C.ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // damage flash
    if (s.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,70,60,' + Math.min(0.8, s.hitFlash * 3.2) + ')';
      ctx.fill(path);
    }
    // tier-up outline
    if (s.tierFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, s.tierFlash);
      ctx.strokeStyle = tcol;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 18;
      ctx.shadowColor = tcol;
      ctx.stroke(path);
      ctx.restore();
    }

    // Nova: reactor charge gathering at the emitter while the trigger is held
    if (ship.weapon.spinUp && s.charge > 0.02) {
      var mz = ship.weapon.pattern[0];
      var chR = 2 + s.charge * 5 + Math.sin(t * 40) * 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= Math.min(1, s.charge * 1.4);
      var chg = ctx.createRadialGradient(mz.x, mz.y, 0, mz.x, mz.y, chR * 2);
      chg.addColorStop(0, '#ffffff');
      chg.addColorStop(0.4, tcol);
      chg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = chg;
      ctx.beginPath(); ctx.arc(mz.x, mz.y, chR * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // muzzle flashes at every emitter of the pattern
    if (s.muzzle > 0) {
      var heavy = ship.weapon.heavy;
      var base = (heavy ? 8 : 4.5) + tier * (heavy ? 2.6 : 1.8);
      var mk = s.muzzle;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= mk;
      var pat = ship.weapon.pattern;
      for (i = 0; i < pat.length; i++) {
        var P = pat[i];
        var mr = base * (0.6 + 0.4 * mk) * (i === 0 ? 1 : 0.8);
        ctx.save();
        ctx.translate(P.x, P.y);
        ctx.rotate(P.a);
        var mg = ctx.createRadialGradient(1, 0, 0, 1, 0, mr);
        mg.addColorStop(0, '#ffffff');
        mg.addColorStop(0.35, tcol);
        mg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.ellipse(mr * 0.35, 0, mr * (heavy ? 1.1 : 1.25), mr * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        if (tier >= 3 || heavy) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = heavy ? 1.6 : 1.1;
          ctx.beginPath();
          ctx.moveTo(-mr * 0.2, 0); ctx.lineTo(mr * 1.6, 0);
          ctx.moveTo(0, -mr * 0.7); ctx.lineTo(0, mr * 0.7);
          ctx.stroke();
        }
        if (heavy || tier >= 5) {
          ctx.strokeStyle = tcol;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(0, 0, mr * (1.1 + (1 - mk) * 0.8), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  var Ships = {
    list: LIST,
    byId: BY_ID,
    ids: LIST.map(function (s) { return s.id; }),
    DEFAULT: 'interceptor',
    get: function (id) { return BY_ID[id] || BY_ID.interceptor; },
    volley: volley,
    draw: draw,
    /** Label + colour of a weapon tier for this ship (HUD, notifications). */
    tierStyle: function (ship, tier) {
      var T = global.WEAPON_TIERS && global.WEAPON_TIERS[tier];
      return { name: T ? T.name : '', color: ship.palette[tier].color, halo: ship.palette[tier].halo };
    },
    /**
     * Real numbers for the selection cards, derived from the definitions:
     * hull = player health, speed = px/s, damage per shot (x shots per
     * volley), shots per second at the base (fully heated) cadence.
     */
    cardStats: function (ship) {
      var B = global.PLAYER_BASE || { speed: 340, health: 100 };
      var w = ship.weapon, n = w.pattern.length;
      var fmt = function (x) { return String(Math.round(x * 10) / 10).replace('.', ','); };
      return {
        hp: B.health,
        speed: Math.round(B.speed * ship.move.speed),
        damage: fmt(w.damage) + (n > 1 ? '×' + n : ''),
        rate: fmt(1 / w.interval) + '/s'
      };
    },
    random: function (exceptId) {
      var pool = LIST.filter(function (s) { return s.id !== exceptId; });
      return pool[Math.floor(Math.random() * pool.length)].id;
    }
  };

  global.Ships = Ships;
}(typeof window !== 'undefined' ? window : this));
