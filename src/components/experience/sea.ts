import { RegattaSim, WIND_KNOT, ZOOM } from "./regattaPhysics";

/**
 * The sea under the regatta, free of the DOM so the boats can ride the same waves that are drawn
 * (waterGL.ts renders exactly this model in a shader).
 *
 * - Sea state: real waves take time to build and to calm down. A coarse grid follows the wind with
 *   a lag (building over a few seconds, dying down more slowly), and the waves follow the grid,
 *   not the pointer, so moving the mouse doesn't make the water jump.
 * - Wind sea: a superposition of wave trains from many directions and wavelengths, each weighted by how
 *   well it runs with the local sea state; their interference gives the short-crested look of a wind sea.
 * - Swell: long waves that outlast the wind. While the pointer blows they run away from it; without it
 *   they come in from the top of the page, with a smaller swell crossing them.
 * - Wakes: every boat's bow sends out small wave packets (a few crests each) along its track; as the
 *   boat is faster than they spread, they add up to the V-shaped wake real boats leave behind, alive
 *   and moving rather than a fixed shape.
 */

export const CELL = 48;          // px per sea-state cell
export const STATE_RANGE = 30;   // knots that fit into the state texture, either way
export const SWELL = 150 * ZOOM; // swell wavelength (px)
export const CROSS = 105 * ZOOM; // wavelength of the second, crossing swell (px)
export const CROSS_ANGLE = 1.2;  // radians between the two swells
export const CROSS_SHARE = 0.18; // height of the crossing swell relative to the main one
export const RING_SPEED = 14 * ZOOM; // px/s, how fast a boat's ring waves spread
export const RING_LIFE = 2.6;    // s
export const RING_WIDTH = 4.5 * ZOOM; // px: width of a wave packet's envelope
export const RING_CRESTS = 2.4;  // crests per envelope width (radians of phase per width)
export const RING_HEIGHT = 0.85;
export const SLOPE = 4;          // how steep a height unit per px looks when shaded
const BUILD = 2.5, CALM = 5;     // s: time constants for the sea to build up and to die down

// Wave trains of the wind sea: irregular directions all round, wavelengths of 45–85 px.
export const TRAINS = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 2 * Math.PI) / 12 + Math.sin(i * 7.3) * 0.22;
    const length = (45 + ((i * 7) % 12) * 3.6) * ZOOM;
    const k = (2 * Math.PI) / length;
    // Deep-water dispersion: longer waves run faster (ω ∝ √k), scaled to look right on screen.
    return { cos: Math.cos(angle), sin: Math.sin(angle), k, omega: Math.sqrt(k) * 5, phase: i * 1.7 };
});

export interface Wake { x: number, y: number, age: number, strength: number, boat: number }

export class Sea {
    cols = 0;
    rows = 0;
    /** Sea state per cell: the wind vector (knots) the waves have built up to. */
    state = new Float32Array(0);
    swell = { x: 0, y: 1 }; // the direction the swell runs: down the page
    /** Height of the swell: a steady swell from the top, higher still after a blow. */
    swellHeight = 1.8;

    constructor(width: number, height: number) {
        this.resize(width, height);
    }

    resize(width: number, height: number) {
        this.cols = Math.ceil(width / CELL) + 1;
        this.rows = Math.ceil(height / CELL) + 1;
        this.state = new Float32Array(this.cols * this.rows * 2);
    }

    /** Lets the sea state follow the wind, and the swell remember where it last came from. */
    update(sim: RegattaSim, dt: number, centerX: number, centerY: number) {
        const build = 1 - Math.exp(-dt / BUILD), calm = 1 - Math.exp(-dt / CALM);
        for (let j = 0; j < this.rows; j++) {
            for (let i = 0; i < this.cols; i++) {
                const w = sim.windAt(i * CELL, j * CELL), k = (j * this.cols + i) * 2;
                const tx = w.x / WIND_KNOT, ty = w.y / WIND_KNOT;
                const rate = Math.hypot(tx, ty) > Math.hypot(this.state[k], this.state[k + 1]) ? build : calm;
                this.state[k] += (tx - this.state[k]) * rate;
                this.state[k + 1] += (ty - this.state[k + 1]) * rate;
            }
        }
        // The swell grows with the sea that's been running, and dies down slowly without it.
        let total = 0;
        for (let c = 0; c < this.state.length; c += 2) total += Math.hypot(this.state[c], this.state[c + 1]);
        const mean = total / (this.state.length / 2 || 1);
        const height = 1.8 + Math.min(0.3, mean / 30);
        this.swellHeight += (height - this.swellHeight) * (1 - Math.exp(-dt / 8));
        const origin = sim.origin;
        if (!origin || sim.sourceStrength < 0.1) {
            // Without the pointer the swell swings round to come in from the top.
            const r = 1 - Math.exp(-dt / 4);
            const x = this.swell.x * (1 - r), y = this.swell.y + (1 - this.swell.y) * r, n = Math.hypot(x, y) || 1;
            this.swell = { x: x / n, y: y / n };
        }
        if (origin && sim.sourceStrength > 0.1) {
            const dx = centerX - origin.x, dy = centerY - origin.y, d = Math.hypot(dx, dy);
            if (d) {
                const r = 1 - Math.exp(-dt / 6); // the swell turns slowly
                const x = this.swell.x + (dx / d - this.swell.x) * r, y = this.swell.y + (dy / d - this.swell.y) * r;
                const n = Math.hypot(x, y) || 1;
                this.swell = { x: x / n, y: y / n };
            }
        }
    }

    /** Sea state (knots, as a wind vector) at a point, interpolated between cells. */
    stateAt(x: number, y: number) {
        const cx = Math.min(Math.max(x / CELL, 0), this.cols - 1.001), cy = Math.min(Math.max(y / CELL, 0), this.rows - 1.001);
        const i = Math.floor(cx), j = Math.floor(cy), fx = cx - i, fy = cy - j;
        const at = (a: number, b: number, c: number) => this.state[(b * this.cols + a) * 2 + c];
        const lerp = (c: number) =>
            (at(i, j, c) * (1 - fx) + at(i + 1, j, c) * fx) * (1 - fy) + (at(i, j + 1, c) * (1 - fx) + at(i + 1, j + 1, c) * fx) * fy;
        return { x: lerp(0), y: lerp(1) };
    }

    /** Ring-wave sources along every boat's track (newest first). */
    wakes(sim: RegattaSim): Wake[] {
        const list: Wake[] = [];
        sim.boats.forEach((b, boat) => {
            const strength = Math.min(1, b.speed / 50);
            if (strength < 0.05) return;
            // Sent out from the bow, which is where the boat parts the water.
            const bx = Math.cos(b.heading) * 14 * ZOOM, by = Math.sin(b.heading) * 14 * ZOOM;
            list.push({ x: b.x + bx, y: b.y + by, age: 0, strength, boat });
            b.trail.forEach((p, n) => {
                const age = b.trailClock + n * 0.12;
                if (age < RING_LIFE) list.push({ x: p.x + bx, y: p.y + by, age, strength, boat });
            });
        });
        return list;
    }

    /** Height of the water at a point, its slope (height units per px) and the sea state there. */
    heightAt(x: number, y: number, time: number, wakes: Wake[] = []) {
        let h = 0, gx = 0, gy = 0;
        // Two crossing swells; the second smaller and turned against the first.
        const c = Math.cos(CROSS_ANGLE), n = Math.sin(CROSS_ANGLE);
        const swells = [
            { x: this.swell.x, y: this.swell.y, k: (2 * Math.PI) / SWELL, omega: 0.9, a: this.swellHeight },
            { x: this.swell.x * c - this.swell.y * n, y: this.swell.x * n + this.swell.y * c, k: (2 * Math.PI) / CROSS, omega: 1.1, a: this.swellHeight * CROSS_SHARE },
        ];
        for (const s of swells) {
            const phase = s.k * (x * s.x + y * s.y) - s.omega * time;
            h += s.a * Math.sin(phase);
            gx += s.a * Math.cos(phase) * s.k * s.x;
            gy += s.a * Math.cos(phase) * s.k * s.y;
        }
        const state = this.stateAt(x, y), knots = Math.hypot(state.x, state.y);
        if (knots > 0.2) {
            const ux = state.x / knots, uy = state.y / knots, sea = Math.min(1.1, knots / 11) * 0.75;
            for (const t of TRAINS) {
                const along = t.cos * ux + t.sin * uy; // how well the train runs with the sea state
                if (along <= 0.45) continue;
                const weight = sea * along * along * along * along;
                const phase = t.k * (x * t.cos + y * t.sin) - t.omega * time + t.phase;
                h += weight * Math.sin(phase);
                gx += weight * Math.cos(phase) * t.k * t.cos;
                gy += weight * Math.cos(phase) * t.k * t.sin;
            }
        }
        for (const w of wakes) {
            const dx = x - w.x, dy = y - w.y, r = Math.hypot(dx, dy);
            const off = (r - (RING_SPEED * w.age + 3)) / RING_WIDTH;
            if (off <= -3 || off >= 3 || !r) continue;
            // A wave packet: a few crests under a bell-shaped envelope, fading as it spreads.
            const a = (1 - w.age / RING_LIFE) * w.strength * RING_HEIGHT, env = Math.exp(-off * off);
            h += a * env * Math.cos(RING_CRESTS * off);
            const dOff = a * env * (-2 * off * Math.cos(RING_CRESTS * off) - RING_CRESTS * Math.sin(RING_CRESTS * off));
            const slope = dOff / RING_WIDTH / r;
            gx += slope * dx;
            gy += slope * dy;
        }
        return { h, gx, gy, knots };
    }
}
