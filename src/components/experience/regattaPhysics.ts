/**
 * A small regatta behind the timeline, kept free of the DOM so it can be tested.
 *
 * Wind: the pointer is the only wind source, blowing outwards in every direction and weaker with
 * distance. Without it the air is calm and the boats slowly lose way.
 *
 * Boats: speed comes from a polar diagram modelled on a typical 35-foot keelboat (boat speed by true wind
 * angle and strength, as in an ORC certificate): nothing closer than about 35° to the wind, fastest on a
 * beam to broad reach, slower dead downwind, and with more wind the speed levels off towards hull speed.
 * Like a real sailor, each boat steers the heading with the best velocity made good (VMG) towards its
 * buoy: straight there when it can, beating at about 45° in tacks when the buoy is upwind, and gybing
 * downwind at 140–160° rather than running dead before the wind. It only switches tack or gybe when the
 * other side is clearly better (turning costs speed) or the water runs out. Speed builds and falls with
 * inertia, the sails are trimmed to the apparent wind and swing to leeward, and the boat heels with it.
 */

const MARGIN = 70;       // px: buoys stay this far from the edges
const SHORE = 110;       // px: boats start bearing away from an edge this far off
/** How close the camera is: boats, waves and wakes are drawn this much larger (speeds stay the same). */
export const ZOOM = 1.4;
const AVOID = 70 * ZOOM;        // px: boats closer than this ahead are given way to
const HULL_OFFSET = 8 * ZOOM;   // px: bow and stern circles from the boat's centre
const HULL_RADIUS = 7.5 * ZOOM;

/** One colour per boat, also used for its buoy and on the scoreboard. */
export const BOAT_COLORS = ["#5a7db0", "#3f9d6b", "#e08f56", "#c4607a", "#8a74c4"];

export interface Boat {
    x: number; y: number;
    heading: number;  // radians, 0 = +x (y grows downwards)
    speed: number;    // px/s
    tack: -1 | 0 | 1; // the side it has decided to sail on (flips with every tack or gybe); 0 = not yet
    tackAge: number;  // seconds on the current tack
    target: { x: number, y: number };
    boom: number;     // sail angle relative to the stern, signed towards leeward
    heel: number;     // 0..1, from the wind
    roll: number;     // radians, from the waves (+: towards starboard)
    heave: number;    // height of the water under it
    lift: number;     // the same, smoothed for drawing
    slam: number;     // how hard the bow is driving into a wave (0..)
    pitch: number;    // radians, bow up (+) or down as it rides over the waves
    luff: number;     // sail flutter when head to wind, 0..1
    trail: { x: number, y: number }[];
    score: number;    // buoys reached
    trailClock: number;
}

export const angleDiff = (a: number, b: number) => {
    let d = (a - b) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Polar diagram: boat speed in knots by true wind angle (rows) and true wind speed (columns).
const POLAR_ANGLES = [0, 30, 38, 45, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180];
const POLAR_WINDS = [0, 4, 8, 12, 16, 20, 25];
const POLAR = [
    // TWS: 0  4    8    12   16   20   25
    [0, 0, 0, 0, 0, 0, 0],                      // 0°   head to wind
    [0, 0.5, 1.0, 1.2, 1.3, 1.3, 1.2],          // 30°  pinching, sails luffing
    [0, 2.5, 4.8, 5.6, 5.9, 6.0, 6.0],          // 38°
    [0, 3.4, 5.9, 6.4, 6.7, 6.9, 7.0],          // 45°  close-hauled
    [0, 3.5, 6.2, 6.9, 7.2, 7.4, 7.5],          // 52°
    [0, 3.8, 6.5, 7.2, 7.5, 7.7, 7.8],          // 60°  close reach
    [0, 4.1, 6.9, 7.5, 7.8, 8.0, 8.2],          // 75°
    [0, 4.2, 7.0, 7.6, 8.0, 8.3, 8.6],          // 90°  beam reach
    [0, 4.0, 6.9, 7.7, 8.3, 8.8, 9.4],          // 110°
    [0, 3.8, 6.6, 7.6, 8.4, 9.1, 9.9],          // 120° broad reach
    [0, 3.3, 6.0, 7.2, 8.2, 9.3, 10.4],         // 135°
    [0, 2.7, 5.1, 6.4, 7.4, 8.4, 9.6],          // 150°
    [0, 2.2, 4.3, 5.6, 6.5, 7.3, 8.2],          // 165°
    [0, 1.9, 3.8, 4.9, 5.8, 6.5, 7.2],          // 180° dead run: the main blankets the jib
];
// The pointer's wind: a broad part that reaches far and a strong near part that fades quickly.
const SOURCE = 220, REACH = 560;  // px/s at full strength, px over which it fades by 1/e
const NEAR = 130, NEAR_REACH = 150;
const EYE = 10;      // px: the small calm right at the pointer, where the wind has no direction
const sourceProfile = (d: number) =>
    (SOURCE * Math.exp(-d / REACH) + NEAR * Math.exp(-d / NEAR_REACH)) * (d / (d + EYE));
// Distance from the pointer at which its wind is strongest; outside it, the wind only weakens.
const PEAK = Array.from({ length: 400 }, (_, d) => d).reduce((best, d) => (sourceProfile(d) > sourceProfile(best) ? d : best), 1);
/** px/s of wind per knot, and px/s of boat speed per knot. */
export const WIND_KNOT = 7;
export const BOAT_KNOT = 8;

const interpolate = (grid: number[], value: number) => {
    const v = clamp(value, grid[0], grid[grid.length - 1]);
    let i = 0;
    while (i < grid.length - 2 && v > grid[i + 1]) i++;
    return { i, f: (v - grid[i]) / (grid[i + 1] - grid[i]) };
};

// Real polars are fairly flat; to make a good or bad course visible at a glance, the differences to the
// best course at a given wind are exaggerated (same order of courses, same optimal angles).
const CONTRAST = 1.6;
const BEST = POLAR_WINDS.map((_, c) => Math.max(...POLAR.map((row) => row[c])));

/** Boat speed in knots at a true wind angle (radians, 0 = head to wind) and true wind speed in knots. */
export function polar(angle: number, knots: number) {
    const a = interpolate(POLAR_ANGLES, Math.abs(angle) * (180 / Math.PI));
    const w = interpolate(POLAR_WINDS, knots);
    const row = (r: number) => POLAR[r][w.i] * (1 - w.f) + POLAR[r][w.i + 1] * w.f;
    const speed = row(a.i) * (1 - a.f) + row(a.i + 1) * a.f;
    const best = BEST[w.i] * (1 - w.f) + BEST[w.i + 1] * w.f;
    return best ? best * Math.pow(speed / best, CONTRAST) : 0;
}

/** Best heading towards `bearing` on one side of the wind (+1: wind from starboard, -1: from port). */
export function bestHeading(from: number, bearing: number, knots: number, side: 1 | -1) {
    let best = { heading: from + side * Math.PI / 2, vmg: -Infinity };
    for (let deg = 32; deg <= 180; deg += 2) {
        const heading = from - side * deg * (Math.PI / 180);
        const vmg = polar(deg * (Math.PI / 180), knots) * Math.cos(angleDiff(heading, bearing));
        if (vmg > best.vmg) best = { heading, vmg };
    }
    return best;
}

/**
 * Share of the sails' force that heels the boat, by apparent wind angle (radians, 0 = head to wind):
 * none while the sails luff, most close-hauled, falling off towards a run.
 */
export function heelingForce(apparent: number) {
    const a = Math.abs(apparent);
    if (a < 0.35) return 0;
    if (a < 0.6) return (a - 0.35) / 0.25;
    return clamp(1 - ((a - 0.6) / (Math.PI - 0.6)) * 0.92, 0, 1);
}

export class RegattaSim {
    width: number;
    height: number;
    time = 0;
    /** Where the pointer blows from (section coordinates), or null when it's elsewhere. */
    source: { x: number, y: number } | null = null;
    /** Eases in and out as the pointer enters and leaves. */
    sourceStrength = 0;
    /** Where the wind comes from: the pointer, or where it was last while the wind dies down. */
    origin: { x: number, y: number } | null = null;
    boats: Boat[] = [];
    random: () => number;

    constructor(width: number, height: number, count = 5, random = Math.random) {
        this.width = width;
        this.height = height;
        this.random = random;
        this.resize(width, height);
        for (let i = 0; i < count; i++) {
            const y = this.height * (i + 0.5) / count;
            const boat: Boat = {
                x: MARGIN + random() * (width - 2 * MARGIN), y,
                heading: random() * Math.PI * 2, speed: 0, tack: 0, tackAge: 0,
                target: { x: 0, y: 0 }, boom: 0, heel: 0, roll: 0, heave: 0, lift: 0, pitch: 0, slam: 0, luff: 0, trail: [], trailClock: 0, score: 0,
            };
            boat.target = this.newTarget(boat, (i + 0.5) / count);
            this.boats.push(boat);
        }
    }

    resize(width: number, height: number) {
        const sx = this.width ? width / this.width : 1, sy = this.height ? height / this.height : 1;
        for (const b of this.boats) {
            b.x *= sx; b.y *= sy; b.target.x *= sx; b.target.y *= sy;
            b.trail = [];
        }
        this.width = width;
        this.height = height;
    }

    /** A new buoy, a good distance away, in the boat's own band of the section so they spread out. */
    newTarget(boat: Boat, band = boat.y / this.height) {
        const count = this.boats.length || 5;
        const span = this.height / count;
        for (let attempt = 0; ; attempt++) {
            const x = MARGIN + this.random() * (this.width - 2 * MARGIN);
            const center = clamp(band * this.height, span / 2, this.height - span / 2);
            const y = clamp(center + (this.random() - 0.5) * span * 1.6, MARGIN, this.height - MARGIN);
            if (Math.hypot(x - boat.x, y - boat.y) > Math.min(this.width, 360) * 0.5 || attempt > 20) return { x, y };
        }
    }

    /** Wind speed (px/s) at distance d from the pointer: strong near it, fading with distance, zero right at it. */
    speedAt(d: number) {
        return this.sourceStrength * sourceProfile(d);
    }

    windAt(x: number, y: number) {
        if (!this.origin || this.sourceStrength <= 0) return { x: 0, y: 0 }; // no pointer, no wind
        const dx = x - this.origin.x, dy = y - this.origin.y, d = Math.hypot(dx, dy);
        if (!d) return { x: 0, y: 0 };
        const speed = this.speedAt(d);
        return { x: (dx / d) * speed, y: (dy / d) * speed };
    }

    /**
     * Radius of the isotach (line of equal wind speed) for `knots` around the pointer, outside the
     * calm eye right at it; null if the wind nowhere gets that strong.
     */
    isotach(knots: number) {
        const speed = knots * WIND_KNOT;
        let lo = PEAK, hi = 6000;
        if (this.speedAt(lo) < speed) return null;
        for (let k = 0; k < 40; k++) {
            const mid = (lo + hi) / 2;
            if (this.speedAt(mid) > speed) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }

    step(dt: number) {
        this.time += dt;
        if (this.source) this.origin = this.source;
        const wanted = this.source ? 1 : 0;
        this.sourceStrength += (wanted - this.sourceStrength) * (1 - Math.exp(-dt / 0.5));
        for (const boat of this.boats) this.sail(boat, dt);
        this.collide();
    }

    /**
     * Boats can't sail through each other. Each hull is two circles (bow and stern); touching ones
     * are pushed apart, lose way in the bump and are turned away from each other a little.
     */
    collide() {
        const circles = (b: Boat) => [-1, 1].map((end) => ({
            x: b.x + Math.cos(b.heading) * HULL_OFFSET * end, y: b.y + Math.sin(b.heading) * HULL_OFFSET * end,
        }));
        for (let i = 0; i < this.boats.length; i++) {
            for (let j = i + 1; j < this.boats.length; j++) {
                const a = this.boats[i], b = this.boats[j];
                if (Math.hypot(a.x - b.x, a.y - b.y) > 2 * (HULL_OFFSET + HULL_RADIUS)) continue;
                for (const p of circles(a)) {
                    for (const q of circles(b)) {
                        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.01;
                        const overlap = 2 * HULL_RADIUS - d;
                        if (overlap <= 0) continue;
                        const nx = dx / d, ny = dy / d;
                        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
                        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
                        // Closing speed along the line between them is lost in the bump.
                        const closing = (Math.cos(a.heading) * a.speed - Math.cos(b.heading) * b.speed) * nx
                            + (Math.sin(a.heading) * a.speed - Math.sin(b.heading) * b.speed) * ny;
                        if (closing > 0) { a.speed *= 0.6; b.speed *= 0.6; }
                        a.heading -= Math.sign(angleDiff(Math.atan2(ny, nx), a.heading) || 1) * 0.04;
                        b.heading -= Math.sign(angleDiff(Math.atan2(-ny, -nx), b.heading) || 1) * 0.04;
                    }
                }
            }
        }
    }

    private sail(b: Boat, dt: number) {
        const w = this.windAt(b.x, b.y);
        const strength = Math.hypot(w.x, w.y);
        const from = Math.atan2(w.y, w.x) + Math.PI;
        const bearing = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        const knots = strength / WIND_KNOT;

        // Course: the best VMG towards the buoy on either tack; stay on the current one unless the
        // other is clearly better (a tack or gybe costs speed) or the current one runs out of water.
        b.tackAge += dt;
        // The side the boat has decided to sail on is kept until it decides to tack or gybe again,
        // not read back from the heading (which lags behind while turning).
        if (!b.tack) b.tack = (Math.sign(angleDiff(b.heading, from)) || 1) as 1 | -1;
        const side = (s: 1 | -1) => bestHeading(from, bearing, knots, s);
        const keep = side((-b.tack) as 1 | -1), other = side(b.tack as 1 | -1);
        const ahead = { x: b.x + Math.cos(keep.heading) * 70, y: b.y + Math.sin(keep.heading) * 70 };
        const edge = ahead.x < MARGIN || ahead.x > this.width - MARGIN || ahead.y < MARGIN || ahead.y > this.height - MARGIN;
        let choice = keep;
        // A tack (through the wind) costs a lot of speed, a gybe (stern through the wind) little.
        const gybe = Math.abs(angleDiff(b.heading, from)) > Math.PI / 2;
        const margin = gybe ? 1.06 : 1.12;
        if ((other.vmg > keep.vmg * margin + 0.05 || edge || keep.vmg <= 0) && b.tackAge > (gybe ? 5 : 6)) {
            choice = other;
            b.tack = -b.tack as 1 | -1;
            b.tackAge = 0;
        }
        // In a calm there's nothing to steer by: hold the course and coast.
        let desired = knots < 0.5 ? b.heading : choice.heading;
        // Keep off the edges: look ahead and turn away from an edge before getting there, the
        // harder the closer it is (and only when heading towards it).
        let awayX = 0, awayY = 0;
        const look = { x: b.x + Math.cos(b.heading) * SHORE * 0.5, y: b.y + Math.sin(b.heading) * SHORE * 0.5 };
        const push = (distance: number) => Math.max(0, 1 - distance / SHORE) ** 2;
        awayX += push(look.x) - push(this.width - look.x);
        awayY += push(look.y) - push(this.height - look.y);
        if (awayX || awayY) {
            const toward = Math.cos(b.heading) * awayX + Math.sin(b.heading) * awayY;
            if (toward < 0) {
                const dx = Math.cos(desired) + awayX * 3, dy = Math.sin(desired) + awayY * 3;
                desired = Math.atan2(dy, dx);
            }
        }
        // Keep clear of other boats: bear away from one close ahead, the harder the closer it is.
        for (const other of this.boats) {
            if (other === b) continue;
            const dx = other.x - b.x, dy = other.y - b.y, d = Math.hypot(dx, dy);
            if (d > AVOID) continue;
            const side = angleDiff(Math.atan2(dy, dx), b.heading);
            if (Math.abs(side) < 1) desired -= (Math.sign(side) || 1) * (1 - d / AVOID) * 1.1;
        }

        // Rudder: a boat turns faster when it moves; even a stalled one turns slowly.
        const turnRate = clamp(0.6 + b.speed / 40, 0.6, 2.4);
        b.heading += clamp(angleDiff(desired, b.heading), -turnRate * dt, turnRate * dt);

        // Speed from the polar diagram, with inertia (boats carry way through a tack).
        const angle = angleDiff(b.heading, from);
        // An overpowered boat, heeled far over, sails slower.
        const target = polar(angle, knots) * BOAT_KNOT * (1 - 0.25 * Math.max(0, b.heel - 0.65));
        b.speed += (target - b.speed) * (1 - Math.exp(-dt / (target > b.speed ? 1.2 : 1.8)));

        // Apparent wind = true wind minus the boat's own motion; the sails are trimmed to it:
        // eased out to about half its angle, on the leeward side, flapping when head to wind.
        const ax = w.x - Math.cos(b.heading) * b.speed, ay = w.y - Math.sin(b.heading) * b.speed;
        const apparent = angleDiff(b.heading, Math.atan2(ay, ax) + Math.PI);
        const apparentStrength = Math.hypot(ax, ay);
        const leeward = Math.sign(apparent) || 1; // wind over the port side: the sails go to starboard
        const trim = clamp((Math.abs(apparent) - 0.3) * 0.55, 0.06, 1.4);
        b.luff = clamp(1 - (Math.abs(apparent) - 0.35) / 0.3, 0, 1) * clamp(apparentStrength / 30, 0, 1);
        const flap = b.luff * Math.sin(this.time * 22 + b.x) * 0.35;
        b.boom += (leeward * trim + flap - b.boom) * (1 - Math.exp(-dt / 0.3));
        // Heel: the sails' force grows with the square of the apparent wind, and the closer to the wind,
        // the more of it pushes sideways (sheeted in hard) rather than forwards. So a boat heels most
        // close-hauled, less on a reach and hardly at all running before the wind; the keel resists
        // more the further it leans, so the heel levels off.
        const force = heelingForce(apparent) * (apparentStrength / 110) ** 2 * (1 - b.luff);
        const heel = 1 - Math.exp(-force);
        b.heel += (heel - b.heel) * (1 - Math.exp(-dt / 0.6));

        // Move, with a little leeway (drift with the wind); keep inside the section.
        b.x = clamp(b.x + (Math.cos(b.heading) * b.speed + w.x * 0.04) * dt, 8, this.width - 8);
        b.y = clamp(b.y + (Math.sin(b.heading) * b.speed + w.y * 0.04) * dt, 8, this.height - 8);

        b.trailClock += dt;
        if (b.trailClock > 0.12) {
            b.trailClock = 0;
            b.trail.unshift({ x: b.x, y: b.y });
            if (b.trail.length > 18) b.trail.pop();
        }

        if (Math.hypot(b.target.x - b.x, b.target.y - b.y) < 22) {
            b.score++;
            b.target = this.newTarget(b);
        }
    }
}
