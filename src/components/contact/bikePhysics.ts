/**
 * A cyclist on the line above the footer, free of the DOM so it can be tested.
 *
 * Every so often a rider comes in from the left and pedals across. The bike is a rigid body (in a side
 * view, y grows downwards): on the ground its wheels carry it, while being dragged it hangs from the
 * pointer on a damped spring, and when let go it flies, spins and lands, on its wheels or anywhere
 * else (wheels, saddle, the rider's head), bouncing a little. Lying on its side the rider gets back up
 * after a moment and rides on. Once off either side, the next ride comes after a pause.
 */

export const DT = 1 / 240;
const GRAVITY = 1400;
/** Drawing and physics scale of the bike (1: wheels 11 px). */
export const SIZE = 0.75;
export const WHEEL = 11 * SIZE;   // wheel radius (px)
const RIDE = 80;                  // px/s, riding along
const MASS = 1;
const INERTIA = 900;
const PAUSE = 14;                 // s between rides

// Points of the bike (its own frame: x forwards, y down; the origin is between the axles) that can
// touch the ground; wheels touch with their rims, the rest with a small radius.
export const CONTACTS = [
    { x: -17, y: 0, r: 11 },      // rear wheel
    { x: 17, y: 0, r: 11 },       // front wheel
    { x: -7, y: -24, r: 3 },      // saddle / hip
    { x: 15, y: -24, r: 3 },      // handlebar
    { x: 9, y: -47, r: 5 },       // the rider's head
].map((p) => ({ x: p.x * SIZE, y: p.y * SIZE, r: p.r * SIZE }));

export interface BikeBody { x: number, y: number, a: number, vx: number, vy: number, w: number }
type Phase = "riding" | "free" | "away";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class BikeSim {
    width: number;
    /** Where the ground is (the line), and how high the bike may fly (canvas top). */
    ground: number;
    ceiling: number;
    bike: BikeBody;
    phase: Phase = "away";
    wait = 2;          // s until the next ride starts
    wheelTurn = 0;     // radians the wheels have turned (and the cranks, geared)
    down = 0;          // s spent lying down
    /** 0..1: the rider's arms go up while the bike is held or flying, back to the bars once riding. */
    armsUp = 0;
    grab: { lx: number, ly: number, x: number, y: number } | null = null;

    constructor(width: number, ground: number, ceiling = 0) {
        this.width = width;
        this.ground = ground;
        this.ceiling = ceiling;
        this.bike = this.start();
    }

    /** A new ride: from just off the left edge, upright on the ground. */
    start(): BikeBody {
        return { x: -40, y: this.ground - WHEEL, a: 0, vx: RIDE, vy: 0, w: 0 };
    }

    /** Point of the bike under (x, y) in its own frame, if any (the bike is about 50×60 px). */
    hit(x: number, y: number) {
        if (this.phase === "away") return null;
        const b = this.bike, c = Math.cos(b.a), s = Math.sin(b.a);
        const dx = x - b.x, dy = y - b.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
        return lx > -30 * SIZE && lx < 30 * SIZE && ly > -56 * SIZE && ly < WHEEL + 3 ? { lx, ly } : null;
    }

    step() {
        if (this.phase === "away") {
            this.wait -= DT;
            if (this.wait <= 0) { this.bike = this.start(); this.phase = "riding"; this.down = 0; }
            return;
        }
        const b = this.bike, c = Math.cos(b.a), s = Math.sin(b.a);
        const world = (p: { x: number, y: number }) => ({ x: b.x + p.x * c - p.y * s, y: b.y + p.x * s + p.y * c });

        if (this.phase === "riding" && !this.grab) {
            // Pedalling along on the line.
            b.vx += (RIDE - b.vx) * (1 - Math.exp(-DT / 0.6));
            b.vy = 0;
            b.w = 0;
            b.a = 0;
            b.y = this.ground - WHEEL;
            b.x += b.vx * DT;
            this.wheelTurn += (b.vx / WHEEL) * DT;
        } else {
            // Free: gravity, the pointer's spring, and the ground pushing back at whatever touches it.
            let fx = 0, fy = MASS * GRAVITY, torque = 0;
            const force = (p: { x: number, y: number }, x: number, y: number) => {
                fx += x; fy += y;
                torque += (p.x - b.x) * y - (p.y - b.y) * x;
            };
            const pointVelocity = (p: { x: number, y: number }) => ({ x: b.vx - b.w * (p.y - b.y), y: b.vy + b.w * (p.x - b.x) });
            let onGround = false, wheelsDown = 0;
            CONTACTS.forEach((contact, i) => {
                const p = world(contact), depth = p.y + contact.r - this.ground;
                if (depth <= 0) return;
                onGround = true;
                if (i < 2) wheelsDown++;
                const v = pointVelocity(p);
                // Wheels roll (little friction along the ground), everything else scrapes.
                const grip = i < 2 ? 0.8 : 6;
                force(p, -grip * v.x * MASS, -3600 * depth * MASS - 50 * v.y * MASS); // y grows downwards: the ground pushes up
            });
            if (this.grab) {
                const g = this.grab, p = world({ x: g.lx, y: g.ly }), v = pointVelocity(p);
                force(p, 300 * (g.x - p.x) - 26 * v.x, 300 * (g.y - p.y) - 26 * v.y);
            }
            b.vx = clamp((b.vx + fx / MASS * DT) * (1 - 0.3 * DT), -3000, 3000);
            b.vy = clamp((b.vy + fy / MASS * DT) * (1 - 0.3 * DT), -3000, 3000);
            b.w = clamp((b.w + torque / INERTIA * DT) * (1 - (onGround ? 3 : 0.4) * DT), -30, 30);
            b.x += b.vx * DT;
            b.y += b.vy * DT;
            b.a += b.w * DT;
            if (b.y < this.ceiling) { b.y = this.ceiling; b.vy = Math.abs(b.vy) * 0.3; }
            this.wheelTurn += (b.vx / WHEEL) * DT * (wheelsDown ? 1 : 0.2);

            // Back on both wheels and slow enough: ride on. Lying on its side for a moment: the rider
            // gets up (the bike swings back upright).
            const upright = Math.abs(Math.atan2(Math.sin(b.a), Math.cos(b.a)));
            if (!this.grab && wheelsDown === 2 && upright < 0.12 && Math.abs(b.vy) < 60) {
                this.phase = "riding";
                b.a = 0;
            } else if (!this.grab && onGround && Math.hypot(b.vx, b.vy) < 40) {
                this.down += DT;
                if (this.down > 1.2) {
                    // Picking it up: lift a little and turn upright.
                    b.vy = Math.min(b.vy, -60);
                    b.w = -Math.sign(Math.atan2(Math.sin(b.a), Math.cos(b.a))) * 4;
                    this.down = 0;
                }
            } else {
                this.down = 0;
            }
        }

        const cheering = this.grab || this.phase === "free" ? 1 : 0;
        this.armsUp += (cheering - this.armsUp) * (1 - Math.exp(-DT / (cheering ? 0.12 : 0.35)));

        // Gone off either side: the next ride comes after a pause.
        if (!this.grab && (b.x > this.width + 50 || b.x < -60)) {
            this.phase = "away";
            this.wait = PAUSE;
        }
    }

    advance(seconds: number) {
        for (let n = Math.round(seconds / DT); n > 0; n--) this.step();
    }

    /** Lets go of a held bike: from here on it's free. */
    release() {
        this.grab = null;
    }

    /** Takes hold of the bike at a point of its own frame (see hit). */
    take(lx: number, ly: number, x: number, y: number) {
        this.grab = { lx, ly, x, y };
        this.phase = "free";
    }
}
