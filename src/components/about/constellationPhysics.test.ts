import { describe, expect, it } from "vitest";
import { ConstellationSim } from "./constellationPhysics";

const links: [number, number][] = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3]];

describe("constellation", () => {
    it("drifts only a little at rest and keeps the profile card still", () => {
        const sim = new ConstellationSim(4, links);
        sim.advance(10);
        for (const node of sim.nodes.slice(1)) expect(Math.hypot(node.x, node.y)).toBeLessThan(6);
        expect(sim.nodes[0]).toMatchObject({ x: 0, y: 0 });
    });

    it("jiggles when picked up and calms down again", () => {
        const sim = new ConstellationSim(4, links);
        sim.take(2);
        let most = 0, turns = 0, previous = 0;
        for (let t = 0; t < 1; t += 1 / 120) {
            sim.advance(1 / 120);
            const tilt = sim.nodes[2].tilt;
            most = Math.max(most, Math.abs(tilt));
            if (previous && Math.sign(tilt) !== Math.sign(previous)) turns++;
            if (Math.abs(tilt) > 0.2) previous = tilt;
        }
        expect(most).toBeGreaterThan(2);
        expect(turns).toBeGreaterThan(2); // back and forth, not just once
        sim.advance(2);
        expect(Math.abs(sim.nodes[2].tilt)).toBeLessThan(0.3);
    });

    it("drags a tile, pulls its neighbours along, and swings it back after a throw", () => {
        const sim = new ConstellationSim(4, links);
        sim.take(3);
        for (let k = 0; k < 30; k++) { sim.held!.x += 6; sim.held!.y += 3; sim.advance(1 / 60); }
        expect(sim.nodes[3].x).toBeGreaterThan(150);
        expect(sim.nodes[1].x).toBeGreaterThan(20); // pulled along
        sim.release();
        let overshot = false;
        for (let t = 0; t < 4; t += 1 / 60) { sim.advance(1 / 60); if (sim.nodes[3].x < -10) overshot = true; }
        expect(overshot).toBe(true); // swings past its place
        for (const node of sim.nodes) expect(Math.hypot(node.x, node.y)).toBeLessThan(6); // and settles
    });

    it("shifts the tiles by different amounts when the pointer moves (parallax)", () => {
        const sim = new ConstellationSim(4, links);
        sim.look = { x: 1, y: 0 };
        sim.advance(4);
        const shifts = sim.nodes.slice(1).map((n) => n.x);
        for (const x of shifts) expect(x).toBeLessThan(-3); // against the pointer
        expect(Math.max(...shifts) - Math.min(...shifts)).toBeGreaterThan(4); // relative to each other
        expect(sim.nodes[0].x).toBe(0);
    });
});
