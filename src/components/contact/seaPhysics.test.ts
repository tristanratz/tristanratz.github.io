import { describe, expect, it } from "vitest";
import { LENGTH, REST, SeaSim } from "./seaPhysics";

// Deterministic "random" for spray.
const seeded = () => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const upright = (a: number) => Math.abs(Math.sin(a));

describe("sea physics", () => {
    it("lets a bottle at rest float, roughly level, near the surface", () => {
        const sim = new SeaSim(530, seeded());
        for (let t = 0; t < 20; t++) {
            sim.advance(0.5);
            const b = sim.bottle!;
            expect(Math.abs(b.y - REST)).toBeLessThan(10);
            expect(upright(b.a)).toBeLessThan(0.3);
        }
    });

    it("settles again after being thrown", () => {
        const sim = new SeaSim(530, seeded());
        sim.advance(1);
        sim.bottle!.vx = 900; sim.bottle!.vy = -1200; sim.bottle!.w = 14;
        sim.advance(12);
        const b = sim.bottle!;
        expect(Math.abs(b.y - REST)).toBeLessThan(10);
        expect(upright(b.a)).toBeLessThan(0.3);
        expect(Math.abs(b.vx) + Math.abs(b.vy)).toBeLessThan(60);
        expect(sim.height.every((h) => Math.abs(h) < 4)).toBe(true);
    });

    it("follows the pointer while grabbed", () => {
        const sim = new SeaSim(530, seeded());
        sim.advance(1);
        const b = sim.bottle!;
        sim.grab = { lx: 0, ly: 0, x: 300, y: 20 };
        sim.advance(2);
        expect(Math.hypot(b.x - 300, b.y - 20)).toBeLessThan(25);
        sim.grab = null;
        sim.advance(8);
        expect(Math.abs(b.y - REST)).toBeLessThan(10);
    });

    it("sails off while sending and brings a new bottle afterwards", () => {
        const sim = new SeaSim(530, seeded());
        sim.away = true;
        sim.advance(4);
        expect(sim.bottle).toBeNull();
        sim.away = false;
        sim.advance(0.1); // the new bottle drops in
        sim.advance(6);
        const b = sim.bottle!;
        expect(b).not.toBeNull();
        expect(b.x).toBeLessThan(530 - LENGTH / 2 + 1);
        expect(Math.abs(b.y - REST)).toBeLessThan(10);
    });
});
