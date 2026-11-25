/* Player weapon tiers: the damage gain per tier is small (see Player),
   the presentation is what grows. Colours stay in the ship's cyan/blue
   family (gold at the top) and never use the enemy orange/red or boss purple. */
const WEAPON_TIERS = [
    null,
    { name: 'PADRÃO',     color: '#00f0ff', core: '#ffffff', halo: '#00b4ff', len: 2.6, w: 0.22, glow: 13, trail: 5,  trailW: 2.0, ember: 0 },
    { name: 'APRIMORADA', color: '#5ffbff', core: '#ffffff', halo: '#00d0ff', len: 3.0, w: 0.26, glow: 18, trail: 7,  trailW: 3.0, ember: 0 },
    { name: 'AVANÇADA',   color: '#3d9bff', core: '#e8fbff', halo: '#00e5ff', len: 3.3, w: 0.30, glow: 22, trail: 9,  trailW: 3.8, ember: 0.06 },
    { name: 'ELITE',      color: '#9fe8ff', core: '#ffffff', halo: '#2f6bff', len: 3.7, w: 0.34, glow: 27, trail: 11, trailW: 4.6, ember: 0.045 },
    { name: 'MÁXIMA',     color: '#ffd34d', core: '#fffbe8', halo: '#ff9f2b', len: 4.1, w: 0.38, glow: 32, trail: 13, trailW: 5.4, ember: 0.03 }
];

// Pre-rendered radial glow sprites (much cheaper than shadowBlur per bullet)
const _glowCache = {};
function getGlowSprite(color) {
    if (_glowCache[color]) return _glowCache[color];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (g) {
        const r = parseInt(color.slice(1, 3), 16), gg = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
        grad.addColorStop(0.25, `rgba(${r},${gg},${b},0.45)`);
        grad.addColorStop(0.6, `rgba(${r},${gg},${b},0.12)`);
        grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
    }
    _glowCache[color] = c;
    return c;
}

class Projectile {
    constructor(x, y, vx, vy, options = {}) {
        this.reset(x, y, vx, vy, options);
    }

    reset(x, y, vx, vy, options = {}) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;

        this.damage = options.damage !== undefined ? options.damage : 10;
        this.type = options.type || 'player';
        this.color = options.color || '#00ffff';
        this.size = options.size !== undefined ? options.size : 6;
        this.lifetime = options.lifetime !== undefined ? options.lifetime : 3.0;
        this.piercing = options.piercing || false;
        this.tier = options.tier || 1;
        this.primary = options.primary !== undefined ? options.primary : true;
        // per-ship weapon look (palette + silhouette); defaults keep the old bolt
        this.pal = options.pal || null;
        this.shape = options.shape || 'bolt';
        this.heavy = !!options.heavy;
        this.noEmber = !!options.noEmber;      // ship-select preview: no world particles

        this.radius = this.size * 0.5;
        this.age = 0;
        this._active = true;

        // trail = fixed ring buffer of positions (no per-frame allocations)
        const T = this.type === 'player' ? (WEAPON_TIERS[this.tier] || WEAPON_TIERS[1]) : null;
        this.maxTrail = T ? T.trail : 5;
        if (!this._trail || this._trail.length < this.maxTrail * 2) this._trail = new Float32Array(this.maxTrail * 2);
        this._ti = 0;
        this._tn = 0;
        this._emberT = 0;
        this._phase = Math.random() * 6.28;

        this._speed = Math.sqrt(vx * vx + vy * vy);
        this._angle = Math.atan2(vy, vx);
        return this;
    }

    get isActive() {
        return this._active;
    }

    // Aliases used by CollisionManager (it reads/writes .active and .owner)
    get active() {
        return this._active;
    }

    set active(v) {
        this._active = !!v;
    }

    get owner() {
        return this.type === 'player' ? 'player' : 'enemy';
    }

    hit() {
        if (!this.piercing) {
            this._active = false;
        }
    }

    update(dt, canvasWidth, canvasHeight) {
        if (!this._active) return;

        this._trail[this._ti * 2] = this.x;
        this._trail[this._ti * 2 + 1] = this.y;
        this._ti = (this._ti + 1) % this.maxTrail;
        if (this._tn < this.maxTrail) this._tn++;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.age += dt;

        if (this.age >= this.lifetime) {
            this._active = false;
            return;
        }

        // high-tier shots shed embers (only the main bolt of a volley)
        if (this.type === 'player' && this.primary && !this.noEmber) {
            const T = WEAPON_TIERS[this.tier];
            if (T && T.ember > 0) {
                this._emberT -= dt;
                if (this._emberT <= 0 && window.particleSystem) {
                    this._emberT = T.ember;
                    const P = this.pal || T;
                    window.particleSystem.emitTrail(this.x, this.y, -this.vx, -this.vy,
                        Math.random() < 0.5 ? P.color : P.halo, 1 + this.tier * 0.18);
                }
            }
        }

        const margin = this.size * 2;
        if (
            canvasWidth !== undefined && canvasHeight !== undefined &&
            (this.x < -margin || this.x > canvasWidth + margin ||
             this.y < -margin || this.y > canvasHeight + margin)
        ) {
            this._active = false;
        }
    }

    // i = 0 is the oldest stored trail point
    _trailX(i) { return this._trail[((this._ti - this._tn + i + this.maxTrail) % this.maxTrail) * 2]; }
    _trailY(i) { return this._trail[((this._ti - this._tn + i + this.maxTrail) % this.maxTrail) * 2 + 1]; }

    draw(ctx) {
        if (!this._active) return;

        const alpha = Math.min(1, (this.lifetime - this.age) / Math.min(this.lifetime, 0.3));

        ctx.save();

        if (this.type === 'player') {
            ctx.globalAlpha = alpha;
            this._drawPlayerProjectile(ctx);
            ctx.restore();
            return;
        }

        if (this._tn > 1) {
            for (let i = 0; i < this._tn; i++) {
                const t = i / this._tn;
                const trailAlpha = t * alpha * 0.5;
                const trailSize = this.size * t * 0.6;

                ctx.save();
                ctx.globalAlpha = trailAlpha;
                ctx.shadowBlur = 8 * t;
                ctx.shadowColor = this.color;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this._trailX(i), this._trailY(i), Math.max(1, trailSize * 0.4), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        ctx.globalAlpha = alpha;

        if (this.type === 'boss') {
            this._drawBossProjectile(ctx);
        } else {
            this._drawEnemyProjectile(ctx);
        }

        ctx.restore();
    }

    _drawPlayerProjectile(ctx) {
        const tier = this.tier;
        const T = WEAPON_TIERS[tier] || WEAPON_TIERS[1];   // geometry / intensity by tier
        const P = this.pal || T;                            // colours by ship
        const shape = this.shape;
        const side = this.primary ? 1 : 0.78;     // side bolts of a volley are a bit smaller
        const baseA = ctx.globalAlpha;
        ctx.globalCompositeOperation = 'lighter';

        // ── energy trail: tapered ribbon from the oldest point to the bolt
        // auxiliary bolts of a volley use a lighter render path (fewer layers)
        const lite = !this.primary;
        const trailMul = shape === 'plasma' ? 1.7 : shape === 'lance' ? 0.75 : shape === 'shard' ? 0.85 : 1;
        const n = this._tn;
        if (n > 1) {
            ctx.lineCap = 'round';
            const step = lite ? 3 : (n > 7 ? 2 : 1);   // fewer strokes for long trails
            let px = this._trailX(0), py = this._trailY(0);
            for (let i = step; i < n + step; i += step) {
                const j = Math.min(i, n);
                const nx = j < n ? this._trailX(j) : this.x;
                const ny = j < n ? this._trailY(j) : this.y;
                const f = j / n;
                ctx.globalAlpha = baseA * f * (0.35 + tier * 0.07);
                ctx.strokeStyle = tier >= 5 && f < 0.5 ? P.halo : P.color;
                ctx.lineWidth = Math.max(0.6, T.trailW * trailMul * f * side);
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(nx, ny);
                ctx.stroke();
                px = nx; py = ny;
            }
            if (tier >= 3 && !lite) {      // bright inner filament
                const h = Math.floor(n / 2);
                ctx.globalAlpha = baseA * 0.55;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(this._trailX(h), this._trailY(h));
                ctx.lineTo(this.x, this.y);
                ctx.stroke();
            }
        }

        // ── glow halo (sprite)
        const pulse = 1 + (tier >= 4 ? 0.12 * Math.sin(this.age * 30 + this._phase) : 0);
        const glowMul = shape === 'plasma' ? 1.35 : shape === 'lance' ? 0.8 : 1;
        const gr = T.glow * glowMul * (lite ? 0.6 : 1) * pulse;
        ctx.globalAlpha = baseA * (0.55 + tier * 0.06);
        ctx.drawImage(getGlowSprite(P.halo), this.x - gr, this.y - gr, gr * 2, gr * 2);
        if (tier >= 5 && !lite) {
            const g2 = gr * 0.65;
            ctx.globalAlpha = baseA * 0.8;
            ctx.drawImage(getGlowSprite(P.color), this.x - g2, this.y - g2, g2 * 2, g2 * 2);
        }

        // ── body (one silhouette per ship weapon)
        const len = this.size * T.len * side;
        const halfW = this.size * T.w * side;
        ctx.translate(this.x, this.y);
        ctx.rotate(this._angle);
        if (shape === 'plasma') this._bodyPlasma(ctx, T, P, tier, baseA, side, lite, pulse);
        else if (shape === 'shard') this._bodyShard(ctx, P, tier, baseA, len, halfW, lite, pulse);
        else if (shape === 'lance') this._bodyLance(ctx, P, tier, baseA, len, halfW, lite, pulse);
        else this._bodyBolt(ctx, P, tier, baseA, len, halfW, lite, pulse);
    }

    // INTERCEPTOR (and fallback): the original energy bolt
    _bodyBolt(ctx, P, tier, baseA, len, halfW, lite, pulse) {
        ctx.globalAlpha = baseA * 0.9;
        ctx.fillStyle = P.color;
        ctx.beginPath();
        ctx.ellipse(-len * 0.15, 0, len, halfW * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = baseA;
        ctx.fillStyle = P.core;
        ctx.beginPath();
        ctx.ellipse(len * 0.05, 0, len * 0.55, halfW * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        if (tier >= 3) {
            // arrow-head tip
            ctx.beginPath();
            ctx.moveTo(len * 0.95, 0);
            ctx.lineTo(len * 0.35, -halfW * 1.5);
            ctx.lineTo(len * 0.5, 0);
            ctx.lineTo(len * 0.35, halfW * 1.5);
            ctx.closePath();
            ctx.fill();
            // twin helix sparks (main bolt only)
            if (!lite) {
                const hw = halfW * 2.2 * Math.sin(this.age * 38 + this._phase);
                ctx.fillStyle = P.halo;
                ctx.beginPath();
                ctx.arc(-len * 0.4, hw, 1.4 + tier * 0.15, 0, Math.PI * 2);
                ctx.arc(-len * 0.4, -hw, 1.4 + tier * 0.15, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (tier >= 4 && !lite) {
            // energy sheath
            ctx.globalAlpha = baseA * 0.55;
            ctx.strokeStyle = P.halo;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.ellipse(-len * 0.1, 0, len * 1.1, halfW * 2.4 * pulse, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (tier >= 5 && !lite) {
            // rotating plasma rings around the head
            ctx.globalAlpha = baseA * 0.8;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.3;
            const rr = halfW * 2.6;
            const spin = this.age * 18 + this._phase;
            ctx.beginPath();
            ctx.ellipse(len * 0.25, 0, rr * 0.45, rr, 0, spin, spin + 2.2);
            ctx.stroke();
            ctx.strokeStyle = '#00e5ff';   // cyan accent keeps the ship's identity
            ctx.beginPath();
            ctx.ellipse(len * 0.25, 0, rr * 0.45, rr, 0, spin + 3.14, spin + 5.3);
            ctx.stroke();
        }
    }

    // STRIKER: a heavy, white-hot plasma orb with a comet head
    _bodyPlasma(ctx, T, P, tier, baseA, side, lite, pulse) {
        const r = this.size * (0.62 + tier * 0.06) * side;
        const wob = 1 + 0.08 * Math.sin(this.age * 45 + this._phase);
        ctx.globalAlpha = baseA * 0.85;
        ctx.fillStyle = P.halo;
        ctx.beginPath();
        ctx.ellipse(-r * 0.5, 0, r * 2.0, r * 1.05 * wob, 0, 0, Math.PI * 2);   // comet body
        ctx.fill();
        ctx.fillStyle = P.color;
        ctx.beginPath();
        ctx.arc(0, 0, r * wob, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = baseA;
        ctx.fillStyle = P.core;
        ctx.beginPath();
        ctx.arc(r * 0.15, 0, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        if (lite) return;
        if (tier >= 3) {
            // flickering corona spikes
            ctx.strokeStyle = P.color;
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = baseA * 0.7;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = this._phase + i * 1.047 + this.age * 9;
                const l = r * (1.4 + 0.4 * Math.sin(this.age * 30 + i));
                ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
            }
            ctx.stroke();
        }
        if (tier >= 4) {
            ctx.globalAlpha = baseA * 0.6;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.4;
            const spin = this.age * 10 + this._phase;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.7 * pulse, r * 0.7, spin, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (tier >= 5) {
            ctx.strokeStyle = P.halo;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.7 * pulse, r * 0.7, -this.age * 10 - this._phase, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // SPECTRE: a violet energy shard (kite shape) with echo blades
    _bodyShard(ctx, P, tier, baseA, len, halfW, lite, pulse) {
        const L = len * 0.95, Wd = halfW * 2.1;
        ctx.globalAlpha = baseA * 0.9;
        ctx.fillStyle = P.color;
        ctx.beginPath();
        ctx.moveTo(L, 0);
        ctx.lineTo(-L * 0.15, -Wd);
        ctx.lineTo(-L * 0.55, 0);
        ctx.lineTo(-L * 0.15, Wd);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = baseA;
        ctx.fillStyle = P.core;
        ctx.beginPath();
        ctx.moveTo(L * 0.8, 0);
        ctx.lineTo(0, -Wd * 0.4);
        ctx.lineTo(-L * 0.3, 0);
        ctx.lineTo(0, Wd * 0.4);
        ctx.closePath();
        ctx.fill();
        if (lite) return;
        if (tier >= 3) {
            // echo blades trailing behind
            ctx.globalAlpha = baseA * 0.45;
            ctx.fillStyle = P.halo;
            ctx.beginPath();
            ctx.moveTo(-L * 0.4, -Wd * 0.4); ctx.lineTo(-L * 1.0, -Wd * 1.3); ctx.lineTo(-L * 0.75, -Wd * 0.2);
            ctx.moveTo(-L * 0.4, Wd * 0.4); ctx.lineTo(-L * 1.0, Wd * 1.3); ctx.lineTo(-L * 0.75, Wd * 0.2);
            ctx.fill();
        }
        if (tier >= 4) {
            ctx.globalAlpha = baseA * 0.6;
            ctx.strokeStyle = P.halo;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(L * 1.2, 0); ctx.lineTo(-L * 0.2, -Wd * 1.5 * pulse);
            ctx.lineTo(-L * 0.7, 0); ctx.lineTo(-L * 0.2, Wd * 1.5 * pulse);
            ctx.closePath();
            ctx.stroke();
        }
        if (tier >= 5) {
            // spinning four-point star at the tip
            ctx.save();
            ctx.translate(L * 0.3, 0);
            ctx.rotate(this.age * 14 + this._phase);
            ctx.globalAlpha = baseA * 0.85;
            ctx.fillStyle = '#ffffff';
            const sr = Wd * 1.3;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4, rr = i % 2 ? sr * 0.3 : sr;
                if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
                else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // NOVA: a long energy lance; consecutive lances read as a pulsing beam
    _bodyLance(ctx, P, tier, baseA, len, halfW, lite, pulse) {
        const L = len * 2.1, Wd = halfW * 0.9;
        ctx.globalAlpha = baseA * 0.85;
        ctx.fillStyle = P.color;
        ctx.beginPath();
        ctx.ellipse(-L * 0.35, 0, L, Wd * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = baseA;
        ctx.strokeStyle = P.core;
        ctx.lineWidth = Math.max(1, Wd * 0.9);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-L * 1.1, 0);
        ctx.lineTo(L * 0.6, 0);
        ctx.stroke();
        if (lite) return;
        if (tier >= 3) {
            // sine filament wrapped around the lance
            ctx.globalAlpha = baseA * 0.7;
            ctx.strokeStyle = P.halo;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i <= 10; i++) {
                const x = -L * 1.2 + (i / 10) * L * 1.8;
                const y = Math.sin(i * 1.3 + this.age * 40 + this._phase) * Wd * 2.2;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        if (tier >= 4) {
            ctx.globalAlpha = baseA * 0.5;
            ctx.strokeStyle = P.halo;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.ellipse(-L * 0.3, 0, L * 1.15, Wd * 3 * pulse, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (tier >= 5) {
            ctx.globalAlpha = baseA * 0.85;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(L * 0.6, 0, Wd * 1.6 * pulse, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawEnemyProjectile(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        const r = this.size * 0.72;

        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff4400';

        const outerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
        outerGrad.addColorStop(0, 'rgba(255,100,0,0.0)');
        outerGrad.addColorStop(0.5, 'rgba(255,60,0,0.15)');
        outerGrad.addColorStop(1, 'rgba(255,30,0,0)');
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = outerGrad;
        ctx.fill();

        const grad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r);
        grad.addColorStop(0, '#ffcc44');
        grad.addColorStop(0.4, '#ff5500');
        grad.addColorStop(0.75, '#cc1100');
        grad.addColorStop(1, '#880000');

        ctx.shadowBlur = 14;
        ctx.shadowColor = '#ff6600';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.arc(-r * 0.3, -r * 0.3, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,220,180,0.75)';
        ctx.fill();

        ctx.restore();
    }

    _drawBossProjectile(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        const r = this.size * 0.85;
        const pulse = 1 + 0.12 * Math.sin(this.age * 8);

        ctx.shadowBlur = 32;
        ctx.shadowColor = '#cc00ff';

        const auraGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.8 * pulse);
        auraGrad.addColorStop(0, 'rgba(180,0,255,0.0)');
        auraGrad.addColorStop(0.4, 'rgba(140,0,220,0.12)');
        auraGrad.addColorStop(0.8, 'rgba(100,0,180,0.06)');
        auraGrad.addColorStop(1, 'rgba(80,0,120,0)');
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.8 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = auraGrad;
        ctx.fill();

        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * pulse);
        grad.addColorStop(0, '#ff88ff');
        grad.addColorStop(0.3, '#cc00ff');
        grad.addColorStop(0.65, '#7700cc');
        grad.addColorStop(1, '#330066');

        ctx.shadowBlur = 22;
        ctx.shadowColor = '#ff00ff';
        ctx.beginPath();
        ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.arc(-r * 0.28 * pulse, -r * 0.28 * pulse, r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,200,255,0.8)';
        ctx.fill();

        const ringCount = 2;
        for (let i = 0; i < ringCount; i++) {
            const ringPhase = this.age * 5 + (i * Math.PI);
            const ringR = r * pulse * (1.15 + i * 0.22);
            const ringAlpha = 0.35 - i * 0.12;
            ctx.save();
            ctx.rotate(ringPhase);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(200,80,255,${ringAlpha})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }
}


class ProjectileManager {
    constructor() {
        this.projectiles = [];
        this._pool = [];
    }

    add(projectile) {
        this.projectiles.push(projectile);
    }

    /** Pooled creation: reuses dead projectiles instead of allocating new ones. */
    spawn(x, y, vx, vy, options) {
        const p = this._pool.length ? this._pool.pop().reset(x, y, vx, vy, options) : new Projectile(x, y, vx, vy, options);
        this.projectiles.push(p);
        return p;
    }

    get active() {
        return this.projectiles.filter(p => p.isActive);
    }

    update(dt, canvasWidth, canvasHeight) {
        for (let i = 0; i < this.projectiles.length; i++) {
            this.projectiles[i].update(dt, canvasWidth, canvasHeight);
        }
    }

    draw(ctx) {
        for (let i = 0; i < this.projectiles.length; i++) {
            this.projectiles[i].draw(ctx);
        }
    }

    // in-place compaction; dead projectiles go back to the pool
    cleanup() {
        const list = this.projectiles;
        let w = 0;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p.isActive) list[w++] = p;
            else if (this._pool.length < 400) this._pool.push(p);
        }
        list.length = w;
    }

    clear() {
        for (let i = 0; i < this.projectiles.length; i++) {
            if (this._pool.length < 400) this._pool.push(this.projectiles[i]);
        }
        this.projectiles.length = 0;
    }
}

window.Projectile = Projectile;
window.ProjectileManager = ProjectileManager;
window.WEAPON_TIERS = WEAPON_TIERS;
