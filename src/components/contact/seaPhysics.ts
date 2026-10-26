/**
 * Physics for the sea at the bottom of the bottle box, kept free of the DOM so it can be tested.
 * The water is a row of coupled springs (a 1D wave equation) on top of a gentle swell; the bottle is a
 * rigid body that floats through buoyancy and drag sampled at points along it, so it tilts, bobs and
 * rights itself. A grabbed bottle hangs on a damped spring from the pointer and can be thrown.
 */

export const HEIGHT = 104;       // canvas height in CSS px
export const REST = HEIGHT - 36; // calm water level, from the top
export const SPACING = 8;        // distance between water columns
export const DT = 1 / 240;       // fixed physics step
const GRAVITY = 1400;

// Bottle geometry in its own frame: the axis runs along x, the neck points to +x.
export const LENGTH = 86;
export const RADIUS = 10;
const SAMPLES = [-38, -29, -20, -11, -2, 7, 16, 25, 33];
const MASS = 1;
const INERTIA = MASS * LENGTH * LENGTH / 12 * 0.7;
const BUOYANCY = MASS * GRAVITY * 2.2 / SAMPLES.length; // per fully submerged sample: floats ~45 % deep
const DRAG = MASS * 16 / SAMPLES.length;

export interface Body { x: number, y: number, a: number, vx: number, vy: number, w: number }
/** The rolled-up letter inside the bottle, in the bottle's own frame (u along the axis, v across). */
export interface Letter { u: number, v: number, vu: number, vv: number }
// Where the letter's centre can go: the inside of the bottle's body, less the letter's own size.
export const LETTER = { minU: -22, maxU: -4, maxV: 3, halfLength: 19, halfWidth: 5.5 };
export interface Drop { x: number, y: number, vx: number, vy: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class SeaSim {
    width: number;
    time = 0;
    height: number[] = [];
    speed: number[] = [];
    bottle: Body | null;
    drops: Drop[] = [];
    /** Grabbed point of the bottle (in its own frame) and where the pointer holds it. */
    grab: { lx: number, ly: number, x: number, y: number } | null = null;
    /** A current carries the bottle off to the right (while the letter is being sent). */
    away = false;
    letter: Letter = { u: -15, v: 0, vu: 0, vv: 0 };
    /** Highest the bottle can go (y grows downwards; negative: above the sea, up into the box). */
    ceiling = RADIUS;
    random: () => number;

    constructor(width: number, random = Math.random) {
        this.width = width;
        this.random = random;
        this.resize(width);
        this.bottle = this.spawn(false);
    }

    resize(width: number) {
        this.width = width;
        const n = Math.ceil(width / SPACING) + 2;
        this.height = Array.from({ length: n }, (_, i) => this.height[i] ?? 0);
        this.speed = Array.from({ length: n }, (_, i) => this.speed[i] ?? 0);
        if (this.bottle) this.bottle.x = clamp(this.bottle.x, LENGTH / 2, width - LENGTH / 2);
    }

    /** A fresh bottle floats at rest; after sending, a new one drops in from above. */
    spawn(dropIn: boolean): Body {
        return dropIn
            ? { x: this.width * 0.18, y: RADIUS + 2, a: 0.45, vx: 50, vy: 250, w: -0.8 }
            : { x: this.width * 0.18, y: REST + 1, a: 0, vx: 0, vy: 0, w: 0 };
    }

    swell(x: number, t = this.time) {
        const strength = this.away ? 1.8 : 1;
        return strength * (2.2 * Math.sin(x * 0.035 - t * 1.6) + 1.1 * Math.sin(x * 0.083 + t * 2.3));
    }

    private sample(values: number[], x: number) {
        const c = clamp(x / SPACING, 0, values.length - 2), i = Math.floor(c), f = c - i;
        return values[i] * (1 - f) + values[i + 1] * f;
    }

    /** Height of the water surface at x (y grows downwards). */
    surface(x: number) {
        return REST + this.swell(x) + this.sample(this.height, x);
    }

    surfaceSpeed(x: number) {
        return (this.swell(x, this.time + 0.01) - this.swell(x)) / 0.01 + this.sample(this.speed, x);
    }

    /** Pushes the water at x down (positive) or up (negative). */
    push(x: number, dv: number) {
        const c = Math.round(clamp(x / SPACING, 0, this.speed.length - 1));
        for (let i = c - 1; i <= c + 1; i++) {
            if (i >= 0 && i < this.speed.length) this.speed[i] = clamp(this.speed[i] + dv * (i === c ? 1 : 0.5), -240, 240);
        }
    }

    /** Something falling into the water at x with a downward speed: a dip and spray. */
    splash(x: number, speed: number) {
        const strength = Math.min(speed, 1200);
        for (let k = -2; k <= 2; k++) this.push(x + k * SPACING, strength * (k ? 0.12 : 0.2));
        for (let n = Math.min(14, Math.round(strength / 80)); n > 0 && this.drops.length < 60; n--) {
            this.drops.push({
                x: x + (this.random() - 0.5) * 16, y: this.surface(x) - 2,
                vx: (this.random() - 0.5) * 220,
                vy: -strength * (0.25 + this.random() * 0.3),
            });
        }
    }

    /** Point on the bottle under (x, y) in its own frame, if any (`slack` widens it, for fingers). */
    hit(x: number, y: number, slack = 0) {
        const b = this.bottle;
        if (!b) return null;
        const dx = x - b.x, dy = y - b.y, c = Math.cos(b.a), s = Math.sin(b.a);
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        return Math.abs(lx) < LENGTH / 2 + 4 + slack && Math.abs(ly) < RADIUS + 6 + slack ? { lx, ly } : null;
    }

    step() {
        this.time += DT;
        const { height, speed } = this;

        // Water: springs back to rest and passes waves on to its neighbours.
        const c2 = 140 * 140 / (SPACING * SPACING);
        for (let i = 0; i < height.length; i++) {
            const left = height[i - 1] ?? height[i], right = height[i + 1] ?? height[i];
            speed[i] += (c2 * (left + right - 2 * height[i]) - 40 * height[i] - 2.5 * speed[i]) * DT;
        }
        for (let i = 0; i < height.length; i++) height[i] = clamp(height[i] + speed[i] * DT, -24, 24);

        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i];
            d.vy += GRAVITY * DT;
            d.x += d.vx * DT;
            d.y += d.vy * DT;
            if (d.vy > 0 && d.y > this.surface(d.x)) { this.push(d.x, d.vy * 0.05); this.drops.splice(i, 1); }
        }

        const b = this.bottle;
        if (!b) return;
        let fx = 0, fy = MASS * GRAVITY, torque = 0;
        const force = (px: number, py: number, x: number, y: number) => {
            fx += x;
            fy += y;
            torque += (px - b.x) * y - (py - b.y) * x;
        };
        const cos = Math.cos(b.a), sin = Math.sin(b.a);
        // Water displaced by the moving bottle rises (or falls) just beside it, not below it:
        // pushing the water under it away would let it dig its own hole and sink.
        const ends = [b.x - Math.abs(cos) * (LENGTH / 2 + 6), b.x + Math.abs(cos) * (LENGTH / 2 + 6)];
        for (const s of SAMPLES) {
            const px = b.x + s * cos, py = b.y + s * sin;
            const wet = clamp((py - this.surface(px) + RADIUS) / (2 * RADIUS), 0, 1);
            if (!wet) continue;
            const vx = b.vx - b.w * (py - b.y), vy = b.vy + b.w * (px - b.x);
            const relative = vy - this.surfaceSpeed(px);
            // Buoyancy acts along the surface normal, so a sloping wave also nudges the bottle sideways.
            const slope = (this.surface(px + 2) - this.surface(px - 2)) / 4;
            force(px, py, -BUOYANCY * wet * slope * 0.5 - DRAG * wet * vx * 0.5, -BUOYANCY * wet - DRAG * wet * relative);
            if (wet < 1) {
                const displaced = -relative * wet * 0.02;
                this.push(ends[0], displaced);
                this.push(ends[1], displaced);
                // Hitting the water fast throws up spray.
                if (Math.abs(relative) > 300 && this.drops.length < 40 && this.random() < 0.3) {
                    this.drops.push({
                        x: px, y: this.surface(px) - 2,
                        vx: vx * 0.3 + (this.random() - 0.5) * 140,
                        vy: -Math.min(Math.abs(relative), 900) * (0.25 + this.random() * 0.25),
                    });
                }
            }
        }
        if (this.away && !this.grab) fx += MASS * 900; // the current that carries the letter off
        if (this.grab) {
            const g = this.grab;
            const ax = b.x + g.lx * cos - g.ly * sin, ay = b.y + g.lx * sin + g.ly * cos;
            const vx = b.vx - b.w * (ay - b.y), vy = b.vy + b.w * (ax - b.x);
            force(ax, ay, MASS * 420 * (g.x - ax) - MASS * 34 * vx, MASS * 420 * (g.y - ay) - MASS * 34 * vy);
        }
        const vx0 = b.vx, vy0 = b.vy;
        b.vx = clamp((b.vx + fx / MASS * DT) * (1 - 0.25 * DT), -2500, 2500);
        b.vy = clamp((b.vy + fy / MASS * DT) * (1 - 0.25 * DT), -2500, 2500);
        b.w = clamp((b.w + torque / INERTIA * DT) * (1 - 0.6 * DT), -25, 25);
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        b.a += b.w * DT;
        this.moveLetter(b, (b.vx - vx0) / DT, (b.vy - vy0) / DT);

        // Soft walls left, right (open while the bottle sails off) and on top.
        const reach = Math.abs(cos) * LENGTH / 2 + Math.abs(sin) * RADIUS;
        if (b.x - reach < 0) { b.x = reach; b.vx = Math.abs(b.vx) * 0.35; }
        if (!this.away && b.x + reach > this.width) { b.x = this.width - reach; b.vx = -Math.abs(b.vx) * 0.35; }
        if (b.y > HEIGHT - 4) { b.y = HEIGHT - 4; b.vy = Math.min(0, b.vy); }
        if (b.y < this.ceiling && !this.grab) { b.y = this.ceiling; b.vy = Math.abs(b.vy) * 0.3; } // stays in view when thrown
        if (this.away && b.x - reach > this.width + 10) this.bottle = null;
    }

    /**
     * The letter rolls about inside the bottle. Seen from the bottle it feels gravity minus the bottle's
     * own acceleration (so it's flung against the glass when the bottle is thrown or stops short) and the
     * pull outwards when the bottle spins; it slides with some friction and bounces off the glass.
     */
    private moveLetter(b: Body, ax: number, ay: number) {
        const L = this.letter;
        const ex = -clamp(ax, -20000, 20000), ey = GRAVITY - clamp(ay, -20000, 20000);
        const c = Math.cos(b.a), s = Math.sin(b.a), spin = b.w * b.w;
        L.vu += (ex * c + ey * s + spin * L.u) * DT;
        L.vv += (-ex * s + ey * c + spin * L.v) * DT;
        const friction = 1 - 4 * DT;
        L.vu *= friction;
        L.vv *= friction;
        L.u += L.vu * DT;
        L.v += L.vv * DT;
        if (L.u < LETTER.minU) { L.u = LETTER.minU; L.vu = Math.abs(L.vu) * 0.35; }
        if (L.u > LETTER.maxU) { L.u = LETTER.maxU; L.vu = -Math.abs(L.vu) * 0.35; }
        if (Math.abs(L.v) > LETTER.maxV) { L.v = Math.sign(L.v) * LETTER.maxV; L.vv = -L.vv * 0.35; }
    }

    /** Advances by `seconds` in fixed steps; brings a new bottle once the old one has sailed off. */
    advance(seconds: number) {
        for (let n = Math.round(seconds / DT); n > 0; n--) this.step();
        if (!this.bottle && !this.away) {
            this.bottle = this.spawn(true);
            this.letter = { u: -15, v: 0, vu: 0, vv: 0 };
        }
    }
}
