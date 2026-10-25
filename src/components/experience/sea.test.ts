import { describe, expect, it } from "vitest";
import { RegattaSim, WIND_KNOT } from "./regattaPhysics";
import { Sea } from "./sea";

const seeded = () => { let s = 3; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

describe("sea", () => {
    it("builds up with the wind over seconds instead of jumping with the pointer", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        const sea = new Sea(800, 600);
        sim.source = { x: 100, y: 300 };
        const settle = (seconds: number) => {
            for (let t = 0; t < seconds; t += 1 / 60) { sim.step(1 / 60); sea.update(sim, 1 / 60, 400, 300); }
        };
        settle(0.5);
        const wind = Math.hypot(sim.windAt(300, 300).x, sim.windAt(300, 300).y) / WIND_KNOT;
        const early = Math.hypot(sea.stateAt(300, 300).x, sea.stateAt(300, 300).y);
        expect(early).toBeLessThan(wind * 0.5);
        settle(10);
        const built = Math.hypot(sea.stateAt(300, 300).x, sea.stateAt(300, 300).y);
        expect(built).toBeGreaterThan(wind * 0.8);
        sim.source = null;
        settle(1);
        expect(Math.hypot(sea.stateAt(300, 300).x, sea.stateAt(300, 300).y)).toBeGreaterThan(built * 0.5); // dies down slowly
    });

    it("reports the slope of the water it describes", () => {
        const sim = new RegattaSim(800, 600, 1, seeded());
        const sea = new Sea(800, 600);
        sim.source = { x: 100, y: 300 };
        for (let t = 0; t < 8; t += 1 / 60) { sim.step(1 / 60); sea.update(sim, 1 / 60, 400, 300); }
        const wakes = [{ x: 330, y: 290, age: 0.6, strength: 1, boat: 0 }];
        for (const [x, y] of [[300, 300], [450, 200], [338, 300]]) {
            const here = sea.heightAt(x, y, 3, wakes);
            const dx = (sea.heightAt(x + 0.01, y, 3, wakes).h - sea.heightAt(x - 0.01, y, 3, wakes).h) / 0.02;
            const dy = (sea.heightAt(x, y + 0.01, 3, wakes).h - sea.heightAt(x, y - 0.01, 3, wakes).h) / 0.02;
            // The sea state is interpolated between cells and treated as constant, so allow a little slack.
            expect(here.gx).toBeCloseTo(dx, 1);
            expect(here.gy).toBeCloseTo(dy, 1);
        }
    });
});
