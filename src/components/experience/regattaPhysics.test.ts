import { describe, expect, it } from "vitest";
import { angleDiff, beaufort, BOAT_KNOT, bestHeading, heelingForce, polar, RegattaSim, WIND_KNOT } from "./regattaPhysics";

const seeded = () => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const DEG = Math.PI / 180;

function run(sim: RegattaSim, seconds: number, each?: () => void) {
    for (let t = 0; t < seconds; t += 1 / 60) { sim.step(1 / 60); each?.(); }
}
/** True wind angle (0–180°) at which a boat makes the most speed. */
const fastestAngle = (knots: number) => {
    let best = 0;
    for (let a = 0; a <= 180; a++) if (polar(a * DEG, knots) > polar(best * DEG, knots)) best = a;
    return best;
};
/** Off-wind angle of the best VMG towards a buoy straight up- or downwind. */
const optimalAngle = (knots: number, downwind: boolean) => {
    const from = 0, bearing = downwind ? Math.PI : 0;
    return Math.abs(angleDiff(bestHeading(from, bearing, knots, 1).heading, from)) / DEG;
};

describe("polar diagram", () => {
    it("makes no way head to wind and is fastest on a reach", () => {
        expect(polar(0, 12)).toBe(0);
        expect(polar(25 * DEG, 12)).toBeLessThan(1.2);
        expect(fastestAngle(12)).toBeGreaterThanOrEqual(90);
        expect(fastestAngle(12)).toBeLessThanOrEqual(120);
        expect(fastestAngle(25)).toBeGreaterThanOrEqual(120); // in a blow, broad reaching wins
        expect(polar(180 * DEG, 12)).toBeLessThan(polar(110 * DEG, 12)); // dead downwind is slow
    });

    it("levels off towards hull speed in more wind", () => {
        const gain = (a: number, b: number) => polar(90 * DEG, b) - polar(90 * DEG, a);
        expect(gain(4, 8)).toBeGreaterThan(gain(16, 20) * 3);
    });

    it("beats at about 45° and gybes downwind instead of running dead downwind", () => {
        for (const knots of [6, 12, 20]) {
            expect(optimalAngle(knots, false)).toBeGreaterThanOrEqual(38);
            expect(optimalAngle(knots, false)).toBeLessThanOrEqual(50);
            expect(optimalAngle(knots, true)).toBeGreaterThanOrEqual(135);
            expect(optimalAngle(knots, true)).toBeLessThanOrEqual(168);
        }
    });
});

describe("regatta", () => {
    it("blows away from the pointer in every direction, and nowhere without it", () => {
        const sim = new RegattaSim(800, 2000, 5, seeded());
        expect(sim.windAt(300, 300)).toEqual({ x: 0, y: 0 });
        sim.source = sim.origin = { x: 400, y: 1000 };
        sim.sourceStrength = 1;
        for (const [x, y] of [[600, 1000], [200, 1000], [400, 800], [400, 1200]]) {
            const w = sim.windAt(x, y);
            expect(Math.abs(angleDiff(Math.atan2(w.y, w.x), Math.atan2(y - 1000, x - 400)))).toBeLessThan(0.01);
        }
        const strength = (x: number, y: number) => Math.hypot(sim.windAt(x, y).x, sim.windAt(x, y).y);
        expect(strength(600, 1000)).toBeGreaterThan(strength(790, 1900));
    });

    it("reaches a buoy on a reach", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        const boat = sim.boats[0];
        Object.assign(boat, { x: 100, y: 300, heading: 0, speed: 0 });
        boat.target = { x: 600, y: 300 };
        sim.source = { x: 350, y: 80 }; // wind across the course
        let reached = false;
        run(sim, 40, () => { if (boat.target.x !== 600) reached = true; });
        expect(reached).toBe(true);
    });

    it("beats upwind in tacks at about 45°", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        const boat = sim.boats[0];
        Object.assign(boat, { x: 650, y: 300, heading: Math.PI, speed: 0 });
        boat.target = { x: 150, y: 300 };
        sim.source = { x: 30, y: 300 }; // wind straight from the buoy
        let reached = false, tacks = 0, side = 0, close = 0, sailing = 0;
        run(sim, 120, () => {
            if (reached) return;
            if (boat.target.x !== 150) { reached = true; return; }
            if (side && boat.tack !== side) tacks++;
            side = boat.tack;
            const w = sim.windAt(boat.x, boat.y);
            const off = Math.abs(angleDiff(boat.heading, Math.atan2(w.y, w.x) + Math.PI)) / DEG;
            if (boat.speed > 10) { sailing++; if (off > 36 && off < 55) close++; }
        });
        expect(reached).toBe(true);
        expect(tacks).toBeGreaterThanOrEqual(1);
        expect(close / sailing).toBeGreaterThan(0.75); // mostly close-hauled
    });

    it("gybes downwind instead of running dead before the wind", () => {
        const sim = new RegattaSim(1000, 1400, 1, seeded());
        const boat = sim.boats[0];
        Object.assign(boat, { x: 500, y: 150, heading: Math.PI / 2, speed: 0 });
        boat.target = { x: 500, y: 1300 };
        sim.source = { x: 500, y: 20 }; // wind from behind
        let gybes = 0, side = 0, deep = 0, sailing = 0, reached = false;
        run(sim, 120, () => {
            if (reached) return;
            if (boat.target.y !== 1300) { reached = true; return; }
            if (side && boat.tack !== side) gybes++;
            side = boat.tack;
            const w = sim.windAt(boat.x, boat.y);
            const off = Math.abs(angleDiff(boat.heading, Math.atan2(w.y, w.x) + Math.PI)) / DEG;
            if (boat.speed > 10) { sailing++; if (off > 172) deep++; }
        });
        expect(reached).toBe(true);
        expect(gybes).toBeGreaterThanOrEqual(1);
        expect(deep / sailing).toBeLessThan(0.15);
    });

    it("loses way once the wind is gone", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        const boat = sim.boats[0];
        Object.assign(boat, { x: 100, y: 300, heading: 0, speed: 0 });
        boat.target = { x: 700, y: 300 };
        sim.source = { x: 350, y: 80 };
        run(sim, 6);
        const sailing = boat.speed;
        expect(sailing / BOAT_KNOT).toBeGreaterThan(3);
        sim.source = null;
        run(sim, 2);
        expect(boat.speed).toBeLessThan(sailing);
        expect(boat.speed).toBeGreaterThan(0); // it coasts, it doesn't stop dead
        run(sim, 15);
        expect(boat.speed).toBeLessThan(1);
    });

    it("keeps every boat inside the section", () => {
        const sim = new RegattaSim(700, 2400, 5, seeded());
        run(sim, 60, () => { sim.source = { x: 350 + Math.sin(sim.time) * 300, y: 1200 }; });
        for (const b of sim.boats) {
            expect(b.x).toBeGreaterThanOrEqual(0);
            expect(b.x).toBeLessThanOrEqual(700);
            expect(b.y).toBeGreaterThanOrEqual(0);
            expect(b.y).toBeLessThanOrEqual(2400);
        }
    });

    it("maps wind to knots in a sensible range", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        sim.source = sim.origin = { x: 0, y: 0 };
        sim.sourceStrength = 1;
        const near = Math.hypot(sim.windAt(120, 0).x, sim.windAt(120, 0).y) / WIND_KNOT;
        expect(near).toBeGreaterThan(15);
        expect(near).toBeLessThan(40);
    });

    it("draws isotachs where the wind has that speed", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        sim.source = sim.origin = { x: 0, y: 0 };
        sim.sourceStrength = 1;
        let previous = 0;
        for (const knots of [16, 12, 8, 4]) {
            const r = sim.isotach(knots)!;
            expect(r).toBeGreaterThan(previous); // weaker wind further out
            const w = sim.windAt(r, 0);
            expect(Math.hypot(w.x, w.y) / WIND_KNOT).toBeCloseTo(knots, 1);
            previous = r;
        }
        expect(sim.isotach(40)).toBeNull();
    });

    it("dies down gradually when the pointer leaves", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        sim.source = { x: 100, y: 100 };
        run(sim, 2);
        const strong = Math.hypot(sim.windAt(300, 100).x, sim.windAt(300, 100).y);
        sim.source = null;
        run(sim, 0.2);
        const fading = Math.hypot(sim.windAt(300, 100).x, sim.windAt(300, 100).y);
        expect(fading).toBeGreaterThan(0);
        expect(fading).toBeLessThan(strong);
        run(sim, 4);
        expect(Math.hypot(sim.windAt(300, 100).x, sim.windAt(300, 100).y)).toBeLessThan(1);
    });

    it("lets boats give way, and never sail through each other", () => {
        const sim = new RegattaSim(800, 600, 2, seeded());
        const [a, b] = sim.boats;
        Object.assign(a, { x: 150, y: 300, heading: 0, speed: 40 });
        Object.assign(b, { x: 650, y: 300, heading: Math.PI, speed: 40 });
        a.target = { x: 700, y: 300 };
        b.target = { x: 100, y: 300 };
        sim.source = { x: 400, y: 30 }; // wind across both courses
        let closest = Infinity;
        run(sim, 30, () => {
            closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
            if (a.target.x !== 700) a.target = { x: 700, y: 300 };
            if (b.target.x !== 100) b.target = { x: 100, y: 300 };
        });
        expect(closest).toBeGreaterThan(14); // hulls never overlap
    });

    it("heels most close-hauled and hardly at all running before the wind", () => {
        expect(heelingForce(0)).toBe(0); // luffing
        expect(heelingForce(35 * DEG)).toBeGreaterThan(heelingForce(90 * DEG));
        expect(heelingForce(90 * DEG)).toBeGreaterThan(heelingForce(170 * DEG));
        const heelOn = (course: number) => {
            const sim = new RegattaSim(2000, 2000, 1, seeded());
            const boat = sim.boats[0];
            sim.source = { x: 1000, y: 1000 };
            Object.assign(boat, { x: 1000 + 200, y: 1000, speed: 0 });
            // Hold the course: the buoy lies straight along it, far away.
            const from = Math.PI; // wind from the pointer, to the west of the boat
            const heading = from + course;
            run(sim, 6, () => {
                boat.heading = heading;
                boat.target = { x: boat.x + Math.cos(heading) * 500, y: boat.y + Math.sin(heading) * 500 };
                boat.x = 1200; boat.y = 1000;
            });
            return boat.heel;
        };
        const close = heelOn(48 * DEG), reach = heelOn(100 * DEG), run_ = heelOn(170 * DEG);
        expect(close).toBeGreaterThan(reach);
        expect(reach).toBeGreaterThan(run_);
        expect(run_).toBeLessThan(close * 0.4); // "hardly at all", compared with close-hauled
    });

    it("turns away from the edges before reaching them", () => {
        const sim = new RegattaSim(900, 2400, 5, seeded());
        let close = 0, samples = 0;
        run(sim, 90, () => {
            // Wind from a pointer that wanders around, so the boats are pushed every which way.
            sim.source = { x: 450 + Math.sin(sim.time / 3) * 400, y: 1200 + Math.cos(sim.time / 5) * 1100 };
            for (const b of sim.boats) {
                samples++;
                if (Math.min(b.x, sim.width - b.x, b.y, sim.height - b.y) < 15) close++;
            }
        });
        expect(close / samples).toBeLessThan(0.03);
    });

    it("heels a little at 4 Bft, is knocked flat by an 8 Bft gust and eases the sheets to come back up", () => {
        const heelAt = (knots: number, seconds: number) => {
            const sim = new RegattaSim(3000, 3000, 1, seeded());
            sim.source = { x: 1500, y: 1500 };
            sim.sourceStrength = 1;
            // Find the distance where the wind blows this hard, then sail close-hauled there.
            const d = sim.isotach(knots)!;
            const boat = sim.boats[0];
            Object.assign(boat, { speed: 30, heel: 0, eased: 0 });
            const heading = Math.PI + 48 * DEG;
            run(sim, seconds, () => {
                Object.assign(boat, { x: 1500 + d, y: 1500, heading });
                boat.target = { x: boat.x + Math.cos(heading) * 500, y: boat.y + Math.sin(heading) * 500 };
            });
            return boat.heel;
        };
        expect(heelAt(11, 4)).toBeLessThan(0.25);       // 4 Bft: some 10-20°
        expect(heelAt(34, 1.6)).toBeGreaterThan(0.85);  // 8 Bft: laid flat at first
        expect(heelAt(34, 8)).toBeLessThan(heelAt(34, 1.6)); // then eased up a little
    });

    it("lets the wind be set, falling off more gently when it's light, with a breeze to the edges", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        sim.source = sim.origin = { x: 0, y: 0 };
        sim.sourceStrength = 1;
        const at = (d: number) => sim.speedAt(d) / WIND_KNOT;
        const strong = at(200);
        sim.windScale = 0.4;
        expect(at(200)).toBeLessThan(strong);
        // Relative to its own strength near the pointer, light wind carries further.
        const light = at(800) / at(150);
        sim.windScale = 1;
        expect(light).toBeGreaterThan(at(800) / at(150));
        // A breeze even far away.
        expect(at(3000)).toBeGreaterThan(2);
        expect(beaufort(sim.peakKnots())).toBe(8);
        sim.windScale = 0.4;
        expect(beaufort(sim.peakKnots())).toBeLessThan(6);
    });
});
