import { describe, expect, it } from "vitest";
import { BikeSim, CONTACTS, WHEEL } from "./bikePhysics";

const lowest = (sim: BikeSim) => {
    const b = sim.bike, c = Math.cos(b.a), s = Math.sin(b.a);
    return Math.max(...CONTACTS.map((p) => b.y + p.x * s + p.y * c + p.r));
};

describe("bike", () => {
    it("rides across from left to right and comes again after a pause", () => {
        const sim = new BikeSim(800, 200);
        sim.advance(3);
        expect(sim.phase).toBe("riding");
        const x = sim.bike.x;
        sim.advance(2);
        expect(sim.bike.x).toBeGreaterThan(x + 100);
        expect(sim.bike.y).toBeCloseTo(200 - WHEEL, 5);
        sim.advance(15);
        expect(sim.phase).toBe("away");
        sim.advance(16);
        expect(sim.phase).toBe("riding");
    });

    it("follows the pointer, flies when thrown, never sinks into the ground and rides on", () => {
        const sim = new BikeSim(800, 200, -200);
        sim.advance(4);
        sim.take(0, -20, sim.bike.x, sim.bike.y - 20);
        for (let k = 0; k < 30; k++) { sim.grab!.y -= 5; sim.grab!.x += 6; sim.advance(1 / 60); }
        expect(sim.bike.y).toBeLessThan(200 - WHEEL - 60); // lifted
        sim.release();
        let deepest = 0;
        for (let t = 0; t < 12; t += 1 / 60) {
            sim.advance(1 / 60);
            if (sim.phase !== "away") deepest = Math.max(deepest, lowest(sim) - 200);
        }
        expect(deepest).toBeLessThan(6); // the ground holds it
        expect(["riding", "away"]).toContain(sim.phase); // back on its wheels (and maybe gone already)
    });

    it("gets back up after landing on its side", () => {
        const sim = new BikeSim(2000, 200, -400);
        sim.advance(4);
        Object.assign(sim.bike, { x: 600, y: 120, a: Math.PI / 2, vx: 0, vy: 0, w: 0 });
        sim.phase = "free";
        let rode = false;
        for (let t = 0; t < 10; t += 1 / 60) {
            sim.advance(1 / 60);
            if (sim.phase === "riding") { rode = true; break; }
        }
        expect(rode).toBe(true);
    });

    it("lands on a line of text, rides along it and drops back down at its end", () => {
        const sim = new BikeSim(1200, 400, -400);
        sim.ledges = [{ x1: 100, x2: 400, y: 150 }];
        sim.advance(4);
        Object.assign(sim.bike, { x: 160, y: 60, a: 0, vx: 20, vy: 0, w: 0 });
        sim.phase = "free";
        let rodeLedge = false, backOnLine = false;
        for (let t = 0; t < 12; t += 1 / 60) {
            sim.advance(1 / 60);
            const feet = sim.bike.y + WHEEL;
            if (sim.phase === "riding" && Math.abs(feet - 150) < 1) rodeLedge = true;
            if (rodeLedge && sim.phase === "riding" && Math.abs(feet - 400) < 1) { backOnLine = true; break; }
        }
        expect(rodeLedge).toBe(true);
        expect(backOnLine).toBe(true);
        expect(sim.bike.x).toBeGreaterThan(400); // came down past the ledge's end
    });

    it("passes through a ledge from below", () => {
        const sim = new BikeSim(1200, 400, -400);
        sim.ledges = [{ x1: 100, x2: 400, y: 300 }];
        sim.advance(4);
        Object.assign(sim.bike, { x: 250, y: 389, a: 0, vx: 0, vy: -900, w: 0 });
        sim.phase = "free";
        let above = false;
        for (let t = 0; t < 1; t += 1 / 60) { sim.advance(1 / 60); if (sim.bike.y < 280) above = true; }
        expect(above).toBe(true);
    });

    it("splashes into the water and sinks, then the next ride comes", () => {
        const sim = new BikeSim(1200, 400, -400);
        sim.water = { x1: 600, x2: 1000, y: 300 };
        sim.advance(4);
        Object.assign(sim.bike, { x: 800, y: 150, a: 0, vx: 0, vy: 0, w: 0 });
        sim.phase = "free";
        let splashed: { x: number, speed: number } | null = null;
        for (let t = 0; t < 2 && !splashed; t += 1 / 60) {
            sim.advance(1 / 60);
            if (sim.splash) { splashed = sim.splash; sim.splash = null; }
        }
        expect(splashed?.x).toBeCloseTo(800, -1);
        expect(splashed!.speed).toBeGreaterThan(300);
        expect(sim.phase).toBe("sinking");
        sim.advance(2);
        expect(sim.phase).toBe("away");
        sim.advance(15);
        expect(sim.phase).toBe("riding");
    });
});
