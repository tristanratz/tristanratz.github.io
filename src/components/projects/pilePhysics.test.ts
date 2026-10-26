import { describe, expect, it } from "vitest";
import { Box, Pile } from "./pilePhysics";

const W = 900, H = 500, CW = 180, CH = 130;

/** A dozen cards dropped from above in a loose grid, a little turned. */
function drop(count = 13) {
    const pile = new Pile();
    pile.setRoom(W, H);
    for (let i = 0; i < count; i++) {
        const box = pile.add(new Box(110 + (i % 4) * 220 + (i % 3) * 7, -80 - Math.floor(i / 4) * 170, CW, CH));
        box.angle = ((i % 5) - 2) * 0.12;
    }
    return pile;
}

/** Corners of a box, for checking it's inside the room. */
const corners = (b: Box) => {
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({
        x: b.position.x + c * sx * b.half.x - s * sy * b.half.y,
        y: b.position.y + s * sx * b.half.x + c * sy * b.half.y,
    }));
};

describe("project pile", () => {
    it("falls, piles up on the floor inside the walls and comes to rest", () => {
        const pile = drop();
        pile.advance(6);
        for (const b of pile.boxes) {
            for (const p of corners(b)) {
                expect(p.y).toBeLessThan(H + 2.5);
                expect(p.x).toBeGreaterThan(-2.5);
                expect(p.x).toBeLessThan(W + 2.5);
            }
            expect(Math.hypot(b.velocity.x, b.velocity.y)).toBeLessThan(15);
        }
        // Everything came down (nothing hangs in the air above the room).
        for (const b of pile.boxes) expect(b.position.y).toBeGreaterThan(0);
    });

    it("lies flat on its face when dropped alone", () => {
        const pile = drop(1);
        pile.advance(4);
        const b = pile.boxes[0];
        expect(b.position.y).toBeCloseTo(H - CH / 2, -0.5);
        expect(Math.abs(Math.sin(b.angle * 2))).toBeLessThan(0.02); // on a side, not on a corner
    });

    it("follows the pointer when held and flies on when let go", () => {
        const pile = drop(1);
        pile.advance(3);
        const b = pile.boxes[0];
        pile.take(b, b.position.x, b.position.y);
        for (let k = 0; k < 40; k++) { pile.held!.target.x += 8; pile.held!.target.y -= 6; pile.advance(1 / 60); }
        expect(b.position.y).toBeLessThan(H - CH / 2 - 150); // lifted
        const x = b.position.x;
        pile.release();
        pile.advance(0.2);
        expect(b.position.x).toBeGreaterThan(x + 20); // thrown on to the right
        pile.advance(4);
        expect(b.position.y).toBeGreaterThan(H - CH); // and back down
    });

    it("keeps a pinned box in place until its time, then lets it fall", () => {
        const pile = new Pile();
        pile.setRoom(W, H);
        const b = pile.add(new Box(300, 150, CW, CH));
        b.pinnedUntil = 0.5;
        pile.advance(0.45);
        expect(b.position.y).toBe(150);
        pile.advance(1.5);
        expect(b.position.y).toBeGreaterThan(H - CH);
    });
});
