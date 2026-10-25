import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../env";
import { Body, DT, HEIGHT, RADIUS, SeaSim, SPACING } from "./seaPhysics";

/**
 * The sea at the bottom of the bottle box, drawn on a canvas in the site's style. The simulation lives
 * in seaPhysics.ts: the bottle floats, tilts and bobs on the waves, can be grabbed, swung and thrown,
 * and makes waves and spray when it hits the water. While `away` is set (the letter is being sent)
 * a current carries it off; afterwards a new one drops in.
 */
export function Sea({ away }: { away: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simRef = useRef<SeaSim | null>(null);
    useEffect(() => { if (simRef.current) simRef.current.away = away; }, [away]);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        const accent = parseColor(getComputedStyle(canvas).getPropertyValue("--accent")) ?? [90, 125, 176];
        const tint = (alpha: number) => `rgba(${accent.join(", ")}, ${alpha})`;
        const reduced = prefersReducedMotion();
        const sim = new SeaSim(canvas.clientWidth);
        simRef.current = sim;

        const draw = () => {
            const { width, time } = sim;
            ctx.clearRect(0, 0, width, HEIGHT);
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

            if (sim.bottle) drawBottle(ctx, sim.bottle, tint);

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

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            sim.resize(canvas.clientWidth);
            canvas.width = Math.round(sim.width * dpr);
            canvas.height = Math.round(HEIGHT * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            draw();
        };

        // Pointer: grab and throw the bottle, or stir the water.
        let last: { x: number, y: number } | null = null;
        const point = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        const onDown = (e: PointerEvent) => {
            const p = point(e), local = sim.hit(p.x, p.y);
            if (local) {
                sim.grab = { ...local, ...p };
                canvas.setPointerCapture(e.pointerId);
                canvas.style.cursor = "grabbing";
                e.preventDefault();
            } else if (p.y > sim.surface(p.x) - 6) {
                sim.push(p.x, 160); // a tap on the water
            }
        };
        const onMove = (e: PointerEvent) => {
            const p = point(e);
            if (sim.grab) {
                sim.grab.x = Math.min(sim.width, Math.max(0, p.x));
                sim.grab.y = Math.min(HEIGHT - 6, Math.max(RADIUS, p.y));
            } else {
                canvas.style.cursor = sim.hit(p.x, p.y) ? "grab" : "";
                // Moving through the surface makes small waves.
                if (last && Math.abs(p.y - sim.surface(p.x)) < 10) {
                    sim.push(p.x, Math.max(-80, Math.min(80, (p.y - last.y) * 6)) + Math.min(25, Math.abs(p.x - last.x) * 0.6));
                }
            }
            last = p;
        };
        const onUp = () => {
            sim.grab = null;
            canvas.style.cursor = "";
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
            canvas.addEventListener("pointerdown", onDown);
            canvas.addEventListener("pointermove", onMove);
            canvas.addEventListener("pointerup", onUp);
            canvas.addEventListener("pointercancel", onUp);
            canvas.addEventListener("pointerleave", onLeave);
        }
        return () => {
            stop();
            observer.disconnect();
            resizeObserver.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            canvas.removeEventListener("pointerdown", onDown);
            canvas.removeEventListener("pointermove", onMove);
            canvas.removeEventListener("pointerup", onUp);
            canvas.removeEventListener("pointercancel", onUp);
            canvas.removeEventListener("pointerleave", onLeave);
        };
    }, []);

    return <canvas ref={canvasRef} className="seaCanvas" style={{ height: HEIGHT }} aria-hidden="true" />;
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

function drawBottle(ctx: CanvasRenderingContext2D, b: Body, tint: (alpha: number) => string) {
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

    // Letter
    ctx.beginPath();
    ctx.roundRect(-34, -5.5, 38, 11, 5.5);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = tint(0.45);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-15, -5.5);
    ctx.lineTo(-15, 5.5);
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
