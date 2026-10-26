import { RefObject, useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../env";
import { Body, DT, HEIGHT, Letter, LETTER, RADIUS, SeaSim, SPACING } from "./seaPhysics";

/**
 * The sea at the bottom of the bottle box, drawn on a canvas in the site's style. The simulation lives
 * in seaPhysics.ts: the bottle floats, tilts and bobs on the waves, can be grabbed, swung and thrown,
 * and makes waves and spray when it hits the water. While `away` is set (the letter is being sent)
 * a current carries it off; afterwards a new one drops in.
 *
 * The canvas covers the whole box (`box`), so the bottle can be lifted out of the water and thrown
 * across it; the water stays along the bottom. It doesn't take clicks itself: the box listens and only
 * catches those that grab the bottle, so the form underneath works as before. The bike from the line
 * below can be thrown in, too (`sea:splash`).
 */
export function Sea({ away, box }: { away: boolean, box: RefObject<HTMLElement> }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simRef = useRef<SeaSim | null>(null);
    useEffect(() => { if (simRef.current) simRef.current.away = away; }, [away]);

    useEffect(() => {
        const canvas = canvasRef.current!, host = box.current!;
        const ctx = canvas.getContext("2d")!;
        // The sea's own coordinates start at the top of the water strip (HEIGHT tall, at the bottom of
        // the box); the strip's top is this far down the canvas.
        let offset = 0;
        const accent = parseColor(getComputedStyle(canvas).getPropertyValue("--accent")) ?? [90, 125, 176];
        const tint = (alpha: number) => `rgba(${accent.join(", ")}, ${alpha})`;
        const reduced = prefersReducedMotion();
        const sim = new SeaSim(canvas.clientWidth);
        simRef.current = sim;

        const draw = () => {
            const { width, time } = sim;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, offset + HEIGHT);
            ctx.translate(0, offset);
            const wave = (offset: number, phase: number) => {
                ctx.beginPath();
                ctx.moveTo(0, HEIGHT);
                for (let x = 0; x <= width + SPACING; x += SPACING / 2) {
                    ctx.lineTo(x, sim.surface(x) + offset + Math.sin(x * 0.05 + time * 1.3 + phase) * 1.5);
                }
                ctx.lineTo(width, HEIGHT);
                ctx.closePath();
            };
            wave(-5, 2);
            ctx.fillStyle = tint(0.08);
            ctx.fill();

            if (sim.bottle) drawBottle(ctx, sim.bottle, sim.letter, tint);

            // The front water covers the submerged part of the bottle.
            wave(0, 0);
            ctx.fillStyle = tint(0.16);
            ctx.fill();
            ctx.beginPath();
            for (let x = 0; x <= width + SPACING; x += SPACING / 2) ctx.lineTo(x, sim.surface(x));
            ctx.strokeStyle = tint(0.45);
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.fillStyle = tint(0.5);
            for (const d of sim.drops) { ctx.beginPath(); ctx.arc(d.x, d.y, 1.6, 0, Math.PI * 2); ctx.fill(); }
        };

        let dpr = 1;
        const resize = () => {
            dpr = window.devicePixelRatio || 1;
            sim.resize(canvas.clientWidth);
            offset = Math.max(0, canvas.clientHeight - HEIGHT);
            sim.ceiling = -offset + RADIUS + 4; // up to the top of the box
            canvas.width = Math.round(sim.width * dpr);
            canvas.height = Math.round((offset + HEIGHT) * dpr);
            draw();
        };

        // Pointer: grab and throw the bottle, or stir the water.
        let last: { x: number, y: number } | null = null;
        const point = (e: { clientX: number, clientY: number }) => {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top - offset };
        };
        // Fingers are less precise than a mouse: they grab from a little further off.
        const slack = (e: { pointerType?: string }) => (e.pointerType === "mouse" ? 0 : 12);
        const onDown = (e: PointerEvent) => {
            const p = point(e), local = sim.hit(p.x, p.y, slack(e));
            if (local) {
                sim.grab = { ...local, ...p };
                host.setPointerCapture(e.pointerId);
                host.style.cursor = "grabbing";
                e.preventDefault();
            } else if (p.y > sim.surface(p.x) - 6 && p.y < HEIGHT) {
                sim.push(p.x, 160); // a tap on the water
            }
        };
        // On touch screens a finger on the bottle grabs it instead of scrolling the page, and keeps
        // holding it while it moves.
        const onTouch = (e: TouchEvent) => {
            const t = e.touches[0];
            if (sim.grab || (t && sim.hit(point(t).x, point(t).y, 12))) e.preventDefault();
        };
        // The bike falling into the water (Bike.tsx).
        const onSplash = (e: Event) => {
            const { clientX, speed } = (e as CustomEvent<{ clientX: number, speed: number }>).detail;
            sim.splash(clientX - canvas.getBoundingClientRect().left, speed);
        };
        const onMove = (e: PointerEvent) => {
            const p = point(e);
            if (sim.grab) {
                sim.grab.x = Math.min(sim.width, Math.max(0, p.x));
                sim.grab.y = Math.min(HEIGHT - 6, Math.max(sim.ceiling, p.y));
            } else {
                const over = !!sim.hit(p.x, p.y);
                if (over !== (host.style.cursor === "grab")) host.style.cursor = over ? "grab" : "";
                // Moving through the surface makes small waves.
                if (last && Math.abs(p.y - sim.surface(p.x)) < 10) {
                    sim.push(p.x, Math.max(-80, Math.min(80, (p.y - last.y) * 6)) + Math.min(25, Math.abs(p.x - last.x) * 0.6));
                }
            }
            last = p;
        };
        const onUp = () => {
            if (!sim.grab) return;
            sim.grab = null;
            host.style.cursor = "";
        };
        const onLeave = () => { last = null; };

        // Runs only while visible.
        let frame = 0, previous = 0, visible = false, carry = 0;
        const loop = (now: number) => {
            frame = requestAnimationFrame(loop);
            carry = Math.min(carry + (previous ? (now - previous) / 1000 : 0), 0.1);
            previous = now;
            const steps = Math.floor(carry / DT);
            carry -= steps * DT;
            sim.advance(steps * DT);
            draw();
        };
        const start = () => {
            if (!frame && visible && !reduced && !document.hidden) { previous = 0; frame = requestAnimationFrame(loop); }
        };
        const stop = () => { cancelAnimationFrame(frame); frame = 0; };
        const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop(); });
        observer.observe(canvas);
        const onVisibility = () => (document.hidden ? stop() : start());
        document.addEventListener("visibilitychange", onVisibility);
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();

        if (!reduced) {
            host.addEventListener("pointerdown", onDown);
            host.addEventListener("pointermove", onMove);
            host.addEventListener("pointerup", onUp);
            host.addEventListener("pointercancel", onUp);
            host.addEventListener("pointerleave", onLeave);
            host.addEventListener("touchstart", onTouch, { passive: false });
            host.addEventListener("touchmove", onTouch, { passive: false });
            window.addEventListener("sea:splash", onSplash);
        }
        return () => {
            stop();
            observer.disconnect();
            resizeObserver.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            host.removeEventListener("pointerdown", onDown);
            host.removeEventListener("pointermove", onMove);
            host.removeEventListener("pointerup", onUp);
            host.removeEventListener("pointercancel", onUp);
            host.removeEventListener("pointerleave", onLeave);
            host.removeEventListener("touchstart", onTouch);
            host.removeEventListener("touchmove", onTouch);
            window.removeEventListener("sea:splash", onSplash);
        };
    }, [box]);

    return <canvas ref={canvasRef} className="seaCanvas" aria-hidden="true" />;
}

// The bottle in the site's style: white glass with a thin accent outline, a rolled-up letter inside.
const glass = (() => {
    if (typeof Path2D === "undefined") return null;
    const p = new Path2D();
    p.moveTo(-36, -RADIUS);
    p.lineTo(12, -RADIUS);
    p.bezierCurveTo(20, -RADIUS, 22, -4.5, 29, -4.5);
    p.lineTo(35, -4.5);
    p.lineTo(35, 4.5);
    p.lineTo(29, 4.5);
    p.bezierCurveTo(22, 4.5, 20, RADIUS, 12, RADIUS);
    p.lineTo(-36, RADIUS);
    p.quadraticCurveTo(-43, RADIUS, -43, 0);
    p.quadraticCurveTo(-43, -RADIUS, -36, -RADIUS);
    p.closePath();
    return p;
})();

function drawBottle(ctx: CanvasRenderingContext2D, b: Body, letter: Letter, tint: (alpha: number) => string) {
    if (!glass) return;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fill(glass);
    ctx.fillStyle = tint(0.12);
    ctx.fill(glass);

    // Letter, wherever it has rolled to inside
    const { halfLength, halfWidth } = LETTER;
    ctx.beginPath();
    ctx.roundRect(letter.u - halfLength, letter.v - halfWidth, halfLength * 2, halfWidth * 2, halfWidth);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = tint(0.45);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(letter.u, letter.v - halfWidth);
    ctx.lineTo(letter.u, letter.v + halfWidth);
    ctx.strokeStyle = tint(0.85);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Outline, highlight, lip and cork
    ctx.strokeStyle = tint(0.9);
    ctx.lineWidth = 1.4;
    ctx.stroke(glass);
    ctx.beginPath();
    ctx.moveTo(-34, -6.5);
    ctx.lineTo(10, -6.5);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(33.5, -5.8, 3.5, 11.6, 1.5);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = tint(0.9);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(37, -3.6, 6, 7.2, 2);
    ctx.fillStyle = tint(0.35);
    ctx.fill();
    ctx.restore();
}


function parseColor(value: string): [number, number, number] | null {
    const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
    const rgb = value.match(/(\d+)\D+(\d+)\D+(\d+)/);
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}
