import { RefObject, useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../env";
import { ConstellationSim, DT } from "./constellationPhysics";

interface Box { x: number, y: number, w: number, h: number }

/**
 * The profile card and the tiles around it as a constellation (physics in constellationPhysics.ts): lines
 * run between them, with small pulses travelling along, and every tile can be grabbed, dragged and
 * thrown; it swings back to its place and pulls its neighbours along a little. A mouse moving over the
 * section shifts the tiles against it, each by its own depth. The tiles stay in the
 * grid (layout, reading order, pre-rendered page); only their offset from there moves. The lines are
 * drawn on a canvas behind the cards, so they show in the gaps.
 */
export function Constellation({ area }: { area: RefObject<HTMLElement> }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current!, root = area.current!;
        if (prefersReducedMotion()) return;
        const ctx = canvas.getContext("2d")!;
        const cards = [root.querySelector<HTMLElement>(".profileCard")!, ...Array.from(root.querySelectorAll<HTMLElement>(".infoCard"))];
        let sim = new ConstellationSim(cards.length, []);
        let homes: Box[] = [], dpr = 1, frames = 0;
        let pulses: { link: number, t: number, speed: number }[] = [];
        let colors = readColors(root);

        const layout = () => {
            const origin = root.getBoundingClientRect();
            dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(origin.width * dpr);
            canvas.height = Math.round(origin.height * dpr);
            // Grid places (layout boxes: the offsets, the fade-in and the hover don't count; the cards'
            // offset parent is the container).
            homes = cards.map((card) => ({ x: card.offsetLeft, y: card.offsetTop, w: card.offsetWidth, h: card.offsetHeight }));
            // Lines: every tile to the profile card, and to the tiles right next to it (sharing an edge
            // across a gap, side by side or one above the other).
            const links: [number, number][] = [];
            const next = (a: Box, b: Box) => {
                const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
                const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
                const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
                const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
                return (overlapX > Math.min(a.w, b.w) / 2 && gapY >= 0 && gapY < 60) || (overlapY > Math.min(a.h, b.h) / 2 && gapX >= 0 && gapX < 60);
            };
            homes.forEach((home, i) => {
                if (i === 0) return;
                links.push([0, i]);
                for (let j = 1; j < i; j++) if (next(homes[j], home)) links.push([j, i]);
            });
            const previous = sim;
            sim = new ConstellationSim(cards.length, links);
            sim.nodes = previous.nodes;
            sim.held = previous.held;
            sim.look = previous.look;
            pulses = links.map((_, k) => ({ link: k, t: Math.random(), speed: 0.18 + Math.random() * 0.2 }));
        };

        const centre = (i: number) => {
            const h = homes[i], n = sim.nodes[i];
            return { x: h.x + h.w / 2 + n.x, y: h.y + h.h / 2 + n.y };
        };
        const draw = (dt: number) => {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            // Only between cards that are already shown (they fade in on scrolling).
            const shown = cards.map((card) => Number(getComputedStyle(card).opacity));
            sim.links.forEach(([a, b], k) => {
                const alpha = Math.min(shown[a], shown[b]);
                if (alpha < 0.05) return;
                const p = centre(a), q = centre(b), active = sim.held && (sim.held.index === a || sim.held.index === b);
                ctx.globalAlpha = alpha * (active ? 0.9 : 0.4);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(q.x, q.y);
                ctx.strokeStyle = colors.accent;
                ctx.lineWidth = active ? 2 : 1.2;
                ctx.stroke();
                const pulse = pulses[k];
                pulse.t = (pulse.t + dt * pulse.speed * (active ? 2.5 : 1)) % 1;
                ctx.beginPath();
                ctx.arc(p.x + (q.x - p.x) * pulse.t, p.y + (q.y - p.y) * pulse.t, active ? 3 : 2.2, 0, Math.PI * 2);
                ctx.fillStyle = colors.accent;
                ctx.globalAlpha = alpha * 0.8;
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            cards.forEach((card, i) => {
                if (i === 0) return;
                const n = sim.nodes[i];
                card.style.translate = `${n.x.toFixed(2)}px ${n.y.toFixed(2)}px`;
                card.style.rotate = `${n.tilt.toFixed(2)}deg`;
                card.style.scale = `${(1 + n.squash).toFixed(4)} ${(1 - n.squash).toFixed(4)}`;
            });
        };

        // Grab, drag and throw a tile.
        let start: { x: number, y: number, nx: number, ny: number } | null = null;
        const onDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            const i = cards.indexOf((e.target as Element).closest<HTMLElement>(".infoCard")!);
            if (i < 1) return;
            sim.take(i);
            start = { x: e.clientX, y: e.clientY, nx: sim.nodes[i].x, ny: sim.nodes[i].y };
            cards[i].setPointerCapture(e.pointerId);
            cards[i].classList.add("held");
            e.preventDefault();
        };
        const onMove = (e: PointerEvent) => {
            // A mouse over the section: the tiles shift against it, each by its depth.
            if (e.pointerType === "mouse" && !sim.held) {
                const r = root.getBoundingClientRect();
                sim.look = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
            }
            if (!sim.held || !start) return;
            sim.held.x = start.nx + e.clientX - start.x;
            sim.held.y = start.ny + e.clientY - start.y;
        };
        const onLeave = () => { sim.look = { x: 0, y: 0 }; };
        const onUp = () => {
            if (!sim.held) return;
            cards[sim.held.index].classList.remove("held");
            sim.release();
            start = null;
        };

        let raf = 0, previous = 0, carry = 0, visible = false;
        const loop = (now: number) => {
            raf = requestAnimationFrame(loop);
            const dt = Math.min(previous ? (now - previous) / 1000 : 0, 0.1);
            previous = now;
            for (carry += dt; carry >= DT; carry -= DT) sim.step();
            if (++frames % 60 === 0) colors = readColors(root); // follows a theme switch
            draw(dt);
        };
        const run = () => { if (!raf && visible && !document.hidden) { previous = 0; raf = requestAnimationFrame(loop); } };
        const stop = () => { cancelAnimationFrame(raf); raf = 0; };
        const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) run(); else stop(); });
        observer.observe(root);
        const onVisibility = () => (document.hidden ? stop() : run());
        document.addEventListener("visibilitychange", onVisibility);
        const resize = new ResizeObserver(layout);
        resize.observe(root);
        layout();
        root.classList.add("constellation");
        root.addEventListener("pointerdown", onDown);
        root.addEventListener("pointermove", onMove);
        root.addEventListener("pointerup", onUp);
        root.addEventListener("pointercancel", onUp);
        root.addEventListener("pointerleave", onLeave);
        return () => {
            stop();
            observer.disconnect();
            resize.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            root.classList.remove("constellation");
            root.removeEventListener("pointerdown", onDown);
            root.removeEventListener("pointermove", onMove);
            root.removeEventListener("pointerup", onUp);
            root.removeEventListener("pointercancel", onUp);
            root.removeEventListener("pointerleave", onLeave);
            cards.forEach((card) => { card.style.translate = ""; card.style.rotate = ""; card.style.scale = ""; });
        };
    }, [area]);

    return <canvas ref={canvasRef} className="constellationLines" aria-hidden="true" />;
}

const readColors = (el: Element) => {
    const style = getComputedStyle(el);
    return { accent: style.getPropertyValue("--accent").trim() };
};
