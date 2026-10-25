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
});
