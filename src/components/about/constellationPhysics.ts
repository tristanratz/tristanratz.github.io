/**
 * The about tiles as a constellation, free of the DOM so it can be tested.
 *
 * Each tile hangs on a spring from its place in the grid (its offset from there is what moves) and is
 * tied to its neighbours by the lines between them: springs that want the two offsets equal, so a tile
 * pulled away drags its neighbours a little along. Node 0 is the profile card, which stays put. At rest
 * the tiles drift a little, like stars. A held tile follows the pointer; let go, it keeps its speed and
 * swings back. Tilt and squash are loose springs too, so a tile jiggles like jelly when it's picked up,
 * pulled around or stopped.
 *
 * The pointer moving over the section (`look`, -1..1 from its middle) shifts the tiles' places against
 * it, each by its own depth, so they move relative to each other like layers (parallax).
 */

export const DT = 1 / 120;
const HOME = 60;       // spring back to the grid place (1/s²)
const LINK = 18;       // springs along the lines
const DAMPING = 5.5;   // underdamped: it swings back past its place once or twice
const DRIFT = 3;       // px of drifting at rest
const PARALLAX = 26;   // px the nearest tile shifts with the pointer at the section's edge

export interface Node {
    x: number, y: number, vx: number, vy: number,
    /** Degrees it leans, and how fast that changes. */
    tilt: number, spin: number,
    /** Stretch along x (squeezed along y) when positive, the other way round when negative. */
    squash: number, squashSpeed: number,
}

export class ConstellationSim {
    /** Offsets from the grid places; node 0 (the profile card) never moves. */
    nodes: Node[];
    links: [number, number][];
    held: { index: number, x: number, y: number } | null = null;
    look = { x: 0, y: 0 };
    /** 0..1 how near each tile is (how far it shifts with the pointer). */
    depths: number[];
    time = 0;

    constructor(count: number, links: [number, number][]) {
        this.nodes = Array.from({ length: count }, () => ({ x: 0, y: 0, vx: 0, vy: 0, tilt: 0, spin: 0, squash: 0, squashSpeed: 0 }));
        this.links = links;
        this.depths = this.nodes.map((_, i) => (i ? 0.35 + ((i * 0.618) % 1) * 0.65 : 0));
    }

    step() {
        this.time += DT;
        const n = this.nodes;
        const ax = n.map(() => 0), ay = n.map(() => 0);
        n.forEach((node, i) => {
            if (i === 0) return;
            const depth = this.depths[i] * PARALLAX;
            const driftX = Math.sin(this.time * 0.5 + i * 2.1) * DRIFT - this.look.x * depth;
            const driftY = Math.cos(this.time * 0.37 + i * 1.3) * DRIFT - this.look.y * depth;
            ax[i] += HOME * (driftX - node.x) - DAMPING * node.vx;
            ay[i] += HOME * (driftY - node.y) - DAMPING * node.vy;
        });
        for (const [a, b] of this.links) {
            const dx = n[b].x - n[a].x, dy = n[b].y - n[a].y;
            ax[a] += LINK * dx; ay[a] += LINK * dy;
            ax[b] -= LINK * dx; ay[b] -= LINK * dy;
        }
        n.forEach((node, i) => {
            if (i === 0) return;
            if (this.held?.index === i) {
                // Under the pointer; its speed (smoothed) is what it's thrown with.
                node.vx += ((this.held.x - node.x) / DT - node.vx) * 0.08;
                node.vy += ((this.held.y - node.y) / DT - node.vy) * 0.08;
                node.x = this.held.x;
                node.y = this.held.y;
            } else {
                node.vx += ax[i] * DT;
                node.vy += ay[i] * DT;
                node.x += node.vx * DT;
                node.y += node.vy * DT;
            }
            // Leans into its horizontal speed and stretches along its motion, both on loose springs.
            const held = this.held?.index === i;
            const lean = Math.max(-16, Math.min(16, node.vx * (held ? 0.02 : 0.012)));
            node.spin += ((lean - node.tilt) * 420 - node.spin * 9) * DT;
            node.tilt += node.spin * DT;
            const stretch = Math.max(-0.06, Math.min(0.06, (Math.abs(node.vx) - Math.abs(node.vy)) * 0.00006));
            node.squashSpeed += ((stretch - node.squash) * 500 - node.squashSpeed * 10) * DT;
            node.squash += node.squashSpeed * DT;
        });
    }

    advance(seconds: number) {
        for (let k = Math.round(seconds / DT); k > 0; k--) this.step();
    }

    take(index: number) {
        const node = this.nodes[index];
        this.held = { index, x: node.x, y: node.y };
        // Picked up: a wobble.
        node.spin += (index % 2 ? 1 : -1) * 90;
        node.squashSpeed += 1.2;
    }

    release() {
        this.held = null;
    }
}
