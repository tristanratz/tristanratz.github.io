import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

interface Node { bx: number; by: number; x: number; y: number; layer: number; glow: number; lastFired: number; }
interface Pulse { from: Node; to: Node; t: number; speed: number; }
interface Pass {
    start: number;
    layerMs: number;
    emitMs: number;
    path: number[];             // chosen node per layer
    strength: number[][];       // activation per node per layer
    lit: number;                // highest layer already lit
    target: () => Point | null; // client coordinates where the token lands
    from?: Point;
    resolve: () => void;
}
interface Burst { x: number; y: number; start: number; }
type Point = { x: number; y: number };

export interface NetworkHandle {
    /** Fires one forward pass through all layers and emits the result towards `target`. */
    forwardPass(target: () => Point | null, speed?: number): Promise<void>;
    /** How long a forward pass at `speed` takes, in ms. */
    passDuration(speed?: number): number;
}

const LAYER_MS = 52;
const EMIT_MS = 300;
const BURST_MS = 520;

import { prefersReducedMotion } from "../../env";

function readColor(name: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "120, 150, 200";
}

// Builds a layered network whose adjacent layers are fully connected.
function buildNetwork(width: number, height: number) {
    const layers = width < 640 ? 5 : width < 1100 ? 7 : 8;
    const [min, max] = height < 700 ? [4, 6] : [5, 8];
    const nodes: Node[][] = [];
    const marginX = width * 0.05;
    const marginY = height * 0.1;
    for (let l = 0; l < layers; l++) {
        const count = l === layers - 1 ? 3 : min + Math.floor(Math.random() * (max - min + 1));
        const x = marginX + (l / (layers - 1)) * (width - 2 * marginX);
        const layer: Node[] = [];
        for (let i = 0; i < count; i++) {
            const y = marginY + ((i + 0.5) / count) * (height - 2 * marginY);
            const bx = x + (Math.random() - 0.5) * 36;
            const by = y + (Math.random() - 0.5) * 28;
            layer.push({ bx, by, x: bx, y: by, layer: l, glow: 0, lastFired: 0 });
        }
        nodes.push(layer);
    }
    return nodes;
}

const bell = (q: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, q)));

export const NeuralNetwork = forwardRef<NetworkHandle>(function NeuralNetwork(_, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const api = useRef<NetworkHandle>({ forwardPass: () => Promise.resolve(), passDuration: () => 0 });

    useImperativeHandle(ref, () => ({
        forwardPass: (target, speed) => api.current.forwardPass(target, speed),
        passDuration: (speed) => api.current.passDuration(speed),
    }), []);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const host = canvas.parentElement!;
        const ctx = canvas.getContext("2d")!;
        let width = 0, height = 0, rect = canvas.getBoundingClientRect();
        let network: Node[][] = [];
        let pulses: Pulse[] = [];
        let passes: Pass[] = [];
        let bursts: Burst[] = [];
        let raf = 0, visible = true, frame = 0;
        let nodeColor = readColor("--net-node");
        let pulseColor = readColor("--net-pulse");
        const mouse = { x: 0, y: 0, sx: 0, sy: 0, px: -1e4, py: -1e4, lastX: 0, lastY: 0, lastTime: 0 };
        // Tailwind (proof of concept): moving the pointer or scrolling fast speeds the signals up,
        // and it calms down again on its own.
        let wind = 0, lastScrollY = window.scrollY;
        const MAX_WIND = 3;
        const gust = (amount: number) => { wind = Math.min(MAX_WIND, wind + amount); };

        const toLocal = (p: Point) => ({ x: p.x - rect.left, y: p.y - rect.top });

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            rect = canvas.getBoundingClientRect();
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            network = buildNetwork(width, height);
            pulses = [];
            passes.forEach((p) => p.resolve());
            passes = [];
            draw(performance.now());
        };

        // Every activation reaches at least one neuron of the next layer, so signals travel all the way
        // to the output instead of dying out after the first hidden layer.
        const fire = (node: Node, chance = 0.3) => {
            node.glow = 1;
            const next = network[node.layer + 1];
            if (!next) return;
            const targets = next.filter(() => Math.random() < chance);
            if (!targets.length) targets.push(next[Math.floor(Math.random() * next.length)]);
            // ~0.3–0.5 s per connection, so a signal crosses the whole network in a few seconds.
            targets.forEach((to) => pulses.push({ from: node, to, t: 0, speed: 0.035 + Math.random() * 0.02 }));
        };

        api.current.passDuration = (speed = 1) => ((network.length - 1) * LAYER_MS + EMIT_MS) / speed;
        api.current.forwardPass = (target, speed = 1) => new Promise<void>((done) => {
            if (prefersReducedMotion() || !network.length || !visible) return done();
            let settled = false;
            const resolve = () => { if (!settled) { settled = true; done(); } };
            // Never leave the caller hanging if frames are throttled (background tab, offscreen).
            const layerMs = LAYER_MS / speed, emitMs = EMIT_MS / speed;
            setTimeout(resolve, (network.length - 1) * layerMs + emitMs + 400);
            passes.push({
                layerMs,
                emitMs,
                start: performance.now(),
                path: network.map((layer) => Math.floor(Math.random() * layer.length)),
                strength: network.map((layer) => layer.map(() => 0.25 + Math.random() * 0.75)),
                lit: -1,
                target,
                resolve,
            });
            start();
        });

        const drawEdge = (a: Node, b: Node) => { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); };

        const draw = (now: number) => {
            ctx.clearRect(0, 0, width, height);

            // Parallax: deeper layers move further with the pointer.
            for (const layer of network) for (const n of layer) {
                const depth = 0.3 + 0.7 * (n.layer / Math.max(1, network.length - 1));
                n.x = n.bx + mouse.sx * 18 * depth;
                n.y = n.by + mouse.sy * 12 * depth;
            }

            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(${nodeColor}, 0.08)`;
            ctx.beginPath();
            for (let l = 0; l < network.length - 1; l++) {
                for (const a of network[l]) for (const b of network[l + 1]) drawEdge(a, b);
            }
            ctx.stroke();

            // Forward passes: every edge between two layers lights up as the wave crosses it.
            for (const pass of passes) {
                const phase = (now - pass.start) / pass.layerMs;
                for (let l = 0; l < network.length - 1; l++) {
                    const q = phase - l;
                    if (q <= 0 || q >= 1) continue;
                    const intensity = bell(q);
                    for (let i = 0; i < network[l].length; i++) {
                        for (let j = 0; j < network[l + 1].length; j++) {
                            const w = pass.strength[l][i] * pass.strength[l + 1][j];
                            ctx.strokeStyle = `rgba(${pulseColor}, ${0.32 * w * intensity})`;
                            ctx.beginPath();
                            drawEdge(network[l][i], network[l + 1][j]);
                            ctx.stroke();
                        }
                    }
                    const a = network[l][pass.path[l]], b = network[l + 1][pass.path[l + 1]];
                    ctx.strokeStyle = `rgba(${pulseColor}, ${0.95 * intensity})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    drawEdge(a, b);
                    ctx.stroke();
                    ctx.lineWidth = 1;
                    ctx.fillStyle = `rgba(${pulseColor}, 1)`;
                    ctx.beginPath();
                    ctx.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, 2.6, 0, Math.PI * 2);
                    ctx.fill();
                }
                while (pass.lit < Math.min(network.length - 1, Math.floor(phase))) {
                    pass.lit++;
                    network[pass.lit].forEach((n, i) => {
                        n.glow = Math.max(n.glow, i === pass.path[pass.lit] ? 1 : pass.strength[pass.lit][i] * 0.7);
                    });
                }

                // Emission from the output neuron to where the token lands.
                const e = (now - pass.start - (network.length - 1) * pass.layerMs) / pass.emitMs;
                if (e > 0) {
                    const out = network[network.length - 1][pass.path[network.length - 1]];
                    const target = pass.target();
                    pass.from ??= { x: out.x, y: out.y };
                    if (target) {
                        const to = toLocal(target);
                        const from = pass.from;
                        const cx = (from.x + to.x) / 2, cy = Math.min(from.y, to.y) - height * 0.18;
                        const point = (t: number) => ({
                            x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * cx + t * t * to.x,
                            y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * cy + t * t * to.y,
                        });
                        const head = Math.min(1, 1 - (1 - e) ** 3);
                        ctx.lineCap = "round";
                        for (let k = 0; k < 14; k++) {
                            const t0 = Math.max(0, head - 0.3 * (k + 1) / 14), t1 = Math.max(0, head - 0.3 * k / 14);
                            const p0 = point(t0), p1 = point(t1);
                            ctx.strokeStyle = `rgba(${pulseColor}, ${0.9 * (1 - k / 14)})`;
                            ctx.lineWidth = 2.4 * (1 - k / 14) + 0.4;
                            ctx.beginPath();
                            ctx.moveTo(p0.x, p0.y);
                            ctx.lineTo(p1.x, p1.y);
                            ctx.stroke();
                        }
                        ctx.lineCap = "butt";
                        ctx.lineWidth = 1;
                        if (e >= 1) bursts.push({ ...to, start: now });
                    }
                    if (e >= 1) pass.resolve();
                }
            }
            passes = passes.filter((p) => (now - p.start - (network.length - 1) * p.layerMs) / p.emitMs < 1);

            for (const b of bursts) {
                const k = (now - b.start) / BURST_MS;
                ctx.strokeStyle = `rgba(${pulseColor}, ${0.6 * (1 - k)})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(b.x, b.y, 6 + k * 34, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.lineWidth = 1;
            bursts = bursts.filter((b) => now - b.start < BURST_MS);

            for (const p of pulses) {
                const x = p.from.x + (p.to.x - p.from.x) * p.t;
                const y = p.from.y + (p.to.y - p.from.y) * p.t;
                ctx.fillStyle = `rgba(${pulseColor}, 0.8)`;
                ctx.beginPath();
                ctx.arc(x, y, 1.6, 0, Math.PI * 2);
                ctx.fill();
            }

            for (const layer of network) for (const n of layer) {
                if (n.glow > 0.02) {
                    const r = 4 + n.glow * 16;
                    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
                    g.addColorStop(0, `rgba(${pulseColor}, ${0.55 * n.glow})`);
                    g.addColorStop(1, `rgba(${pulseColor}, 0)`);
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = `rgba(${nodeColor}, ${0.35 + n.glow * 0.65})`;
                ctx.beginPath();
                ctx.arc(n.x, n.y, 2.6 + n.glow * 1.4, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        const step = (now: number) => {
            if (++frame % 30 === 0) {
                nodeColor = readColor("--net-node");
                pulseColor = readColor("--net-pulse");
            }
            wind *= 0.95;
            mouse.sx += (mouse.x - mouse.sx) * 0.06;
            mouse.sy += (mouse.y - mouse.sy) * 0.06;

            // Idle activity plus neurons reacting to the pointer.
            if (Math.random() < 0.025 * (1 + wind * 2) && network[0]) fire(network[0][Math.floor(Math.random() * network[0].length)]);
            for (const layer of network) for (const n of layer) {
                const d = Math.hypot(n.x - mouse.px, n.y - mouse.py);
                if (d < 110) {
                    n.glow = Math.max(n.glow, 1 - d / 110);
                    if (now - n.lastFired > 700 && Math.random() < 0.08) { n.lastFired = now; fire(n, 0.5); }
                }
            }
            // Collect arrivals first: firing inside the filter would push into the array being replaced.
            const arrived: Node[] = [];
            pulses = pulses.filter((p) => {
                p.t += p.speed * (1 + wind);
                if (p.t >= 1) { arrived.push(p.to); return false; }
                return true;
            });
            arrived.forEach((node) => fire(node, 0.05)); // mostly one path on, occasionally branching
            if (pulses.length > 220) pulses.splice(0, pulses.length - 220);
            for (const layer of network) for (const n of layer) n.glow *= 0.94;

            draw(now);
            raf = visible ? requestAnimationFrame(step) : 0;
        };

        const start = () => {
            if (!raf && visible && !prefersReducedMotion()) raf = requestAnimationFrame(step);
        };

        const onPointerMove = (e: PointerEvent) => {
            const now = performance.now();
            if (mouse.lastTime) {
                const speed = Math.hypot(e.clientX - mouse.lastX, e.clientY - mouse.lastY) / Math.max(1, now - mouse.lastTime);
                gust(Math.max(0, speed - 0.3) * 0.12); // ignore slow, deliberate movement
            }
            mouse.lastX = e.clientX;
            mouse.lastY = e.clientY;
            mouse.lastTime = now;
            rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
            mouse.px = e.clientX - rect.left;
            mouse.py = e.clientY - rect.top;
        };
        const onPointerLeave = () => { mouse.x = mouse.y = 0; mouse.px = mouse.py = -1e4; };
        const onPointerDown = (e: PointerEvent) => {
            if ((e.target as HTMLElement).closest("a, button, input")) return;
            rect = canvas.getBoundingClientRect();
            const p = toLocal({ x: e.clientX, y: e.clientY });
            for (const layer of network) for (const n of layer) {
                if (Math.hypot(n.x - p.x, n.y - p.y) < 180) fire(n, 0.6);
            }
            bursts.push({ ...p, start: performance.now() });
        };

        const setVisible = (value: boolean) => {
            visible = value;
            if (!visible) { passes.forEach((p) => p.resolve()); passes = []; }
            start();
        };
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && !document.hidden));
        const onVisibility = () => setVisible(!document.hidden);
        const onScroll = () => {
            rect = canvas.getBoundingClientRect();
            gust(Math.abs(window.scrollY - lastScrollY) * 0.004);
            lastScrollY = window.scrollY;
        };
        const resizeObserver = new ResizeObserver(resize);

        resize();
        observer.observe(canvas);
        resizeObserver.observe(canvas);
        host.addEventListener("pointermove", onPointerMove);
        host.addEventListener("pointerleave", onPointerLeave);
        host.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("scroll", onScroll, { passive: true });
        document.addEventListener("visibilitychange", onVisibility);
        start();

        return () => {
            cancelAnimationFrame(raf);
            passes.forEach((p) => p.resolve());
            observer.disconnect();
            resizeObserver.disconnect();
            host.removeEventListener("pointermove", onPointerMove);
            host.removeEventListener("pointerleave", onPointerLeave);
            host.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("scroll", onScroll);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    return <canvas ref={canvasRef} className="neuralNetwork" aria-hidden="true" />;
});
