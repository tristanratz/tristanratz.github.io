/**
 * Rigid boxes for the project pile, free of the DOM so it can be tested: a small port of Erin Catto's
 * Box2D-Lite (box–box collision by clipping, sequential impulses with warm starting and friction), in
 * pixels with y growing downwards. Walls are boxes without mass. A box can be pinned in place for a
 * while (it then acts like a wall) before it falls. A held box hangs from the pointer on a stiff,
 * damped spring; let go, it keeps its speed (thrown).
 */

export const DT = 1 / 120;
const ITERATIONS = 10;
const GRAVITY = 2200;         // px/s²
const ALLOWED_PENETRATION = 1; // px
const BIAS = 0.2;

interface Vec { x: number, y: number }
const v = (x: number, y: number): Vec => ({ x, y });
const add = (a: Vec, b: Vec) => v(a.x + b.x, a.y + b.y);
const sub = (a: Vec, b: Vec) => v(a.x - b.x, a.y - b.y);
const scale = (a: Vec, s: number) => v(a.x * s, a.y * s);
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const crossVS = (a: Vec, s: number) => v(s * a.y, -s * a.x);
const crossSV = (s: number, a: Vec) => v(-s * a.y, s * a.x);
const abs = (a: Vec) => v(Math.abs(a.x), Math.abs(a.y));

/** Rotation matrix by its columns. */
interface Mat { c1: Vec, c2: Vec }
const rot = (angle: number): Mat => { const c = Math.cos(angle), s = Math.sin(angle); return { c1: v(c, s), c2: v(-s, c) }; };
const mul = (m: Mat, a: Vec) => v(m.c1.x * a.x + m.c2.x * a.y, m.c1.y * a.x + m.c2.y * a.y);
const transpose = (m: Mat): Mat => ({ c1: v(m.c1.x, m.c2.x), c2: v(m.c1.y, m.c2.y) });
const mulMM = (a: Mat, b: Mat): Mat => ({ c1: mul(a, b.c1), c2: mul(a, b.c2) });
const absM = (m: Mat): Mat => ({ c1: abs(m.c1), c2: abs(m.c2) });

export class Box {
    position: Vec;
    angle = 0;
    velocity = v(0, 0);
    spin = 0;
    force = v(0, 0);
    torque = 0;
    half: Vec;
    friction = 0.5;
    invMass: number;
    invI: number;
    /** Held in place (like a wall) until this time of the pile (s); then it falls. */
    pinnedUntil = 0;
    private free: { invMass: number, invI: number };

    constructor(x: number, y: number, width: number, height: number, mass = width * height * 0.001) {
        this.position = v(x, y);
        this.half = v(width / 2, height / 2);
        const I = (mass * (width * width + height * height)) / 12;
        this.invMass = Number.isFinite(mass) ? 1 / mass : 0;
        this.invI = Number.isFinite(mass) ? 1 / I : 0;
        this.free = { invMass: this.invMass, invI: this.invI };
    }

    /** Pinned: no mass (nothing moves it), else its own. */
    pin(pinned: boolean) {
        this.invMass = pinned ? 0 : this.free.invMass;
        this.invI = pinned ? 0 : this.free.invI;
    }
}

interface Contact {
    position: Vec, normal: Vec, separation: number, feature: number,
    r1: Vec, r2: Vec, Pn: number, Pt: number, massNormal: number, massTangent: number, bias: number,
}

// Box2D-Lite's feature pairs (which edges made a contact point), packed into one number to match
// contacts between steps.
type Features = [number, number, number, number]; // inEdge1, outEdge1, inEdge2, outEdge2
const key = (f: Features) => f[0] | (f[1] << 3) | (f[2] << 6) | (f[3] << 9);
interface ClipVertex { v: Vec, f: Features }

function clipSegment(vIn: ClipVertex[], normal: Vec, offset: number, clipEdge: number): ClipVertex[] {
    const out: ClipVertex[] = [];
    const d0 = dot(normal, vIn[0].v) - offset, d1 = dot(normal, vIn[1].v) - offset;
    if (d0 <= 0) out.push(vIn[0]);
    if (d1 <= 0) out.push(vIn[1]);
    if (d0 * d1 < 0) {
        const t = d0 / (d0 - d1);
        const p = add(vIn[0].v, scale(sub(vIn[1].v, vIn[0].v), t));
        const f: Features = d0 > 0 ? [clipEdge, vIn[0].f[1], 0, vIn[0].f[3]] : [vIn[1].f[0], clipEdge, vIn[1].f[2], 0];
        out.push({ v: p, f });
    }
    return out;
}

function incidentEdge(h: Vec, pos: Vec, R: Mat, normal: Vec): ClipVertex[] {
    const n = scale(mul(transpose(R), normal), -1), nAbs = abs(n);
    let c: ClipVertex[];
    if (nAbs.x > nAbs.y) {
        c = n.x > 0
            ? [{ v: v(h.x, -h.y), f: [0, 0, 3, 4] }, { v: v(h.x, h.y), f: [0, 0, 4, 1] }]
            : [{ v: v(-h.x, h.y), f: [0, 0, 1, 2] }, { v: v(-h.x, -h.y), f: [0, 0, 2, 3] }];
    } else {
        c = n.y > 0
            ? [{ v: v(h.x, h.y), f: [0, 0, 4, 1] }, { v: v(-h.x, h.y), f: [0, 0, 1, 2] }]
            : [{ v: v(-h.x, -h.y), f: [0, 0, 2, 3] }, { v: v(h.x, -h.y), f: [0, 0, 3, 4] }];
    }
    return c.map((p) => ({ v: add(pos, mul(R, p.v)), f: p.f }));
}

/** Contact points of two boxes (none if apart); the normal points from a to b. */
function collide(a: Box, b: Box): Contact[] {
    const hA = a.half, hB = b.half, posA = a.position, posB = b.position;
    const RA = rot(a.angle), RB = rot(b.angle), RAT = transpose(RA), RBT = transpose(RB);
    const dp = sub(posB, posA), dA = mul(RAT, dp), dB = mul(RBT, dp);
    const C = mulMM(RAT, RB), absC = absM(C), absCT = transpose(absC);

    const faceA = sub(sub(abs(dA), hA), mul(absC, hB));
    if (faceA.x > 0 || faceA.y > 0) return [];
    const faceB = sub(sub(abs(dB), mul(absCT, hA)), hB);
    if (faceB.x > 0 || faceB.y > 0) return [];

    // The axis of least penetration, preferring A's faces a little (for coherence).
    let axis = 0, separation = faceA.x, normal = dA.x > 0 ? RA.c1 : scale(RA.c1, -1);
    const rel = 0.95, absTol = 0.01;
    if (faceA.y > rel * separation + absTol * hA.y) { axis = 1; separation = faceA.y; normal = dA.y > 0 ? RA.c2 : scale(RA.c2, -1); }
    if (faceB.x > rel * separation + absTol * hB.x) { axis = 2; separation = faceB.x; normal = dB.x > 0 ? RB.c1 : scale(RB.c1, -1); }
    if (faceB.y > rel * separation + absTol * hB.y) { axis = 3; separation = faceB.y; normal = dB.y > 0 ? RB.c2 : scale(RB.c2, -1); }

    let front: number, frontNormal: Vec, sideNormal: Vec, negSide: number, posSide: number, negEdge: number, posEdge: number;
    let edge: ClipVertex[];
    if (axis === 0 || axis === 1) {
        frontNormal = normal;
        const along = axis === 0;
        front = dot(posA, frontNormal) + (along ? hA.x : hA.y);
        sideNormal = along ? RA.c2 : RA.c1;
        const side = dot(posA, sideNormal), extent = along ? hA.y : hA.x;
        negSide = -side + extent; posSide = side + extent;
        [negEdge, posEdge] = along ? [3, 1] : [2, 4];
        edge = incidentEdge(hB, posB, RB, frontNormal);
    } else {
        frontNormal = scale(normal, -1);
        const along = axis === 2;
        front = dot(posB, frontNormal) + (along ? hB.x : hB.y);
        sideNormal = along ? RB.c2 : RB.c1;
        const side = dot(posB, sideNormal), extent = along ? hB.y : hB.x;
        negSide = -side + extent; posSide = side + extent;
        [negEdge, posEdge] = along ? [3, 1] : [2, 4];
        edge = incidentEdge(hA, posA, RA, frontNormal);
    }

    const clip1 = clipSegment(edge, scale(sideNormal, -1), negSide, negEdge);
    if (clip1.length < 2) return [];
    const clip2 = clipSegment(clip1, sideNormal, posSide, posEdge);
    if (clip2.length < 2) return [];

    const contacts: Contact[] = [];
    for (const p of clip2) {
        const sep = dot(frontNormal, p.v) - front;
        if (sep > 0) continue;
        const f: Features = axis >= 2 ? [p.f[2], p.f[3], p.f[0], p.f[1]] : p.f;
        contacts.push({
            position: sub(p.v, scale(frontNormal, sep)), normal, separation: sep, feature: key(f),
            r1: v(0, 0), r2: v(0, 0), Pn: 0, Pt: 0, massNormal: 0, massTangent: 0, bias: 0,
        });
    }
    return contacts;
}

class Arbiter {
    contacts: Contact[];
    friction: number;
    constructor(public a: Box, public b: Box, contacts: Contact[]) {
        this.contacts = contacts;
        this.friction = Math.sqrt(a.friction * b.friction);
    }

    /** New contacts, keeping the impulses of the ones that persist (warm starting). */
    update(contacts: Contact[]) {
        for (const c of contacts) {
            const old = this.contacts.find((o) => o.feature === c.feature);
            if (old) { c.Pn = old.Pn; c.Pt = old.Pt; }
        }
        this.contacts = contacts;
    }

    preStep(invDt: number) {
        const { a, b } = this;
        for (const c of this.contacts) {
            const r1 = sub(c.position, a.position), r2 = sub(c.position, b.position);
            const rn1 = dot(r1, c.normal), rn2 = dot(r2, c.normal);
            c.massNormal = 1 / (a.invMass + b.invMass + a.invI * (dot(r1, r1) - rn1 * rn1) + b.invI * (dot(r2, r2) - rn2 * rn2));
            const tangent = crossVS(c.normal, 1);
            const rt1 = dot(r1, tangent), rt2 = dot(r2, tangent);
            c.massTangent = 1 / (a.invMass + b.invMass + a.invI * (dot(r1, r1) - rt1 * rt1) + b.invI * (dot(r2, r2) - rt2 * rt2));
            c.bias = -BIAS * invDt * Math.min(0, c.separation + ALLOWED_PENETRATION);
            const P = add(scale(c.normal, c.Pn), scale(tangent, c.Pt));
            a.velocity = sub(a.velocity, scale(P, a.invMass));
            a.spin -= a.invI * cross(r1, P);
            b.velocity = add(b.velocity, scale(P, b.invMass));
            b.spin += b.invI * cross(r2, P);
            c.r1 = r1; c.r2 = r2;
        }
    }

    applyImpulse() {
        const { a, b } = this;
        for (const c of this.contacts) {
            const relative = () => sub(add(b.velocity, crossSV(b.spin, c.r2)), add(a.velocity, crossSV(a.spin, c.r1)));
            const apply = (P: Vec) => {
                a.velocity = sub(a.velocity, scale(P, a.invMass));
                a.spin -= a.invI * cross(c.r1, P);
                b.velocity = add(b.velocity, scale(P, b.invMass));
                b.spin += b.invI * cross(c.r2, P);
            };
            let dv = relative();
            let dPn = c.massNormal * (-dot(dv, c.normal) + c.bias);
            const Pn0 = c.Pn;
            c.Pn = Math.max(Pn0 + dPn, 0);
            dPn = c.Pn - Pn0;
            apply(scale(c.normal, dPn));

            dv = relative();
            const tangent = crossVS(c.normal, 1);
            const maxPt = this.friction * c.Pn;
            const Pt0 = c.Pt;
            c.Pt = Math.max(-maxPt, Math.min(maxPt, Pt0 + c.massTangent * -dot(dv, tangent)));
            apply(scale(tangent, c.Pt - Pt0));
        }
    }
}

export class Pile {
    boxes: Box[] = [];
    walls: Box[] = [];
    arbiters = new Map<string, Arbiter>();
    held: { box: Box, local: Vec, target: Vec } | null = null;
    time = 0;

    /** The room: floor at `height`, walls at 0 and `width`, a ceiling at `top` (may be above 0). */
    setRoom(width: number, height: number, top = -800) {
        const t = 400; // wall thickness
        const wall = (x: number, y: number, w: number, h: number) => new Box(x, y, w, h, Infinity);
        this.walls = [
            wall(width / 2, height + t / 2, width + 2 * t, t),
            wall(-t / 2, (top + height) / 2, t, height - top + 2 * t),
            wall(width + t / 2, (top + height) / 2, t, height - top + 2 * t),
            wall(width / 2, top - t / 2, width + 2 * t, t),
        ];
        this.arbiters.clear();
    }

    add(box: Box) {
        this.boxes.push(box);
        return box;
    }

    /** Takes hold of a box at a point (world coordinates). */
    take(box: Box, x: number, y: number) {
        const local = mul(transpose(rot(box.angle)), sub(v(x, y), box.position));
        this.held = { box, local, target: v(x, y) };
    }

    release() {
        this.held = null;
    }

    /** A random kick to every box (a shake). */
    shake(random = Math.random) {
        for (const b of this.boxes) {
            b.velocity = add(b.velocity, v((random() - 0.5) * 900, -500 - random() * 900));
            b.spin += (random() - 0.5) * 8;
        }
    }

    step() {
        this.time += DT;
        for (const b of this.boxes) {
            const pinned = b.pinnedUntil > this.time;
            if (pinned !== (b.invMass === 0)) b.pin(pinned);
            if (pinned) { b.velocity = v(0, 0); b.spin = 0; }
        }
        const all = [...this.boxes, ...this.walls];
        // Broad phase: every pair (a dozen boxes), keeping persistent contacts.
        for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) {
                const a = all[i], b = all[j];
                if (a.invMass === 0 && b.invMass === 0) continue;
                const id = `${i}:${j}`;
                const contacts = collide(a, b);
                const existing = this.arbiters.get(id);
                if (!contacts.length) { this.arbiters.delete(id); continue; }
                if (existing && existing.a === a && existing.b === b) existing.update(contacts);
                else this.arbiters.set(id, new Arbiter(a, b, contacts));
            }
        }

        if (this.held) {
            // Pulled towards the pointer: a stiff, damped spring at the grabbed point.
            const { box, local, target } = this.held;
            const r = mul(rot(box.angle), local), p = add(box.position, r);
            const pv = add(box.velocity, crossSV(box.spin, r));
            const mass = 1 / box.invMass, k = 2200 * mass, c = 80 * mass;
            const F = sub(scale(sub(target, p), k), scale(pv, c));
            box.force = add(box.force, F);
            box.torque += cross(r, F);
            box.spin *= 0.97;
        }

        for (const b of this.boxes) {
            if (b.invMass === 0) continue; // pinned
            b.velocity = add(b.velocity, scale(add(v(0, GRAVITY), scale(b.force, b.invMass)), DT));
            b.spin += DT * b.invI * b.torque;
        }
        const invDt = 1 / DT;
        for (const arb of this.arbiters.values()) arb.preStep(invDt);
        for (let k = 0; k < ITERATIONS; k++) for (const arb of this.arbiters.values()) arb.applyImpulse();
        for (const b of this.boxes) {
            if (b.invMass === 0) continue; // pinned
            // Keep it sane: thrown hard, not out of the world.
            const speed = Math.hypot(b.velocity.x, b.velocity.y);
            if (speed > 4000) b.velocity = scale(b.velocity, 4000 / speed);
            b.spin = Math.max(-25, Math.min(25, b.spin));
            b.position = add(b.position, scale(b.velocity, DT));
            b.angle += b.spin * DT;
            b.force = v(0, 0);
            b.torque = 0;
        }
    }

    advance(seconds: number) {
        for (let k = Math.round(seconds / DT); k > 0; k--) this.step();
    }
}
