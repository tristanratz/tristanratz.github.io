import { RefObject, useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../env";
import { BikeBody, BikeSim, DT, SIZE } from "./bikePhysics";

/**
 * A cyclist riding along the line above the footer every now and then (physics in bikePhysics.ts).
 * It can be grabbed, swung and thrown through the whole contact section, arms up; it lands, picks
 * itself up and rides on. The canvas sits on the line and reaches up to the top of the section
 * (`host`); it takes no clicks itself, the section catches only those that grab the bike.
 */
export function Bike({ host }: { host: RefObject<HTMLElement> }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current!, area = host.current!;
        if (prefersReducedMotion()) return;
        const ctx = canvas.getContext("2d")!;
        const sim = new BikeSim(canvas.clientWidth, canvas.clientHeight - 0.5, 10);
        let colors = readColors(canvas), frames = 0, dpr = 1;

        const resize = () => {
            dpr = window.devicePixelRatio || 1;
            // From the line up to the top of the section, so it can be thrown through all of it.
            const room = Math.max(120, canvas.getBoundingClientRect().bottom - area.getBoundingClientRect().top);
            if (Math.abs(canvas.clientHeight - room) > 1) canvas.style.height = `${room}px`;
            sim.width = canvas.clientWidth;
            sim.ground = canvas.clientHeight - 0.5;
            canvas.width = Math.round(canvas.clientWidth * dpr);
            canvas.height = Math.round(canvas.clientHeight * dpr);
        };

        const draw = () => {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
            if (sim.phase !== "away") drawBike(ctx, sim.bike, sim.wheelTurn, sim.armsUp, colors);
        };

        // Pointer: grab and throw the bike.
        const point = (e: { clientX: number, clientY: number }) => {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        const onDown = (e: PointerEvent) => {
            const p = point(e), local = sim.hit(p.x, p.y);
            if (!local) return;
            sim.take(local.lx, local.ly, p.x, p.y);
            area.setPointerCapture(e.pointerId);
            area.style.cursor = "grabbing";
            e.preventDefault();
        };
        const onMove = (e: PointerEvent) => {
            const p = point(e);
            if (sim.grab) {
                sim.grab.x = p.x;
                sim.grab.y = Math.min(sim.ground, p.y);
            } else {
                const over = !!sim.hit(p.x, p.y);
                if (over !== (area.style.cursor === "grab")) area.style.cursor = over ? "grab" : "";
            }
        };
        const onUp = () => {
            if (!sim.grab) return;
            sim.release();
            area.style.cursor = "";
        };
        const onTouch = (e: TouchEvent) => {
            const t = e.touches[0];
            if (t && sim.hit(point(t).x, point(t).y)) e.preventDefault();
        };

        let frame = 0, previous = 0, carry = 0, visible = false;
        const loop = (now: number) => {
            frame = requestAnimationFrame(loop);
            carry = Math.min(carry + (previous ? (now - previous) / 1000 : 0), 0.1);
            previous = now;
            for (; carry >= DT; carry -= DT) sim.step();
            if (++frames % 60 === 0) colors = readColors(canvas); // follows a theme switch
            draw();
        };
        const start = () => { if (!frame && visible && !document.hidden) { previous = 0; frame = requestAnimationFrame(loop); } };
        const stop = () => { cancelAnimationFrame(frame); frame = 0; };
        const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop(); });
        observer.observe(canvas);
        const onVisibility = () => (document.hidden ? stop() : start());
        document.addEventListener("visibilitychange", onVisibility);
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resizeObserver.observe(area);
        resize();
        area.addEventListener("pointerdown", onDown);
        area.addEventListener("pointermove", onMove);
        area.addEventListener("pointerup", onUp);
        area.addEventListener("pointercancel", onUp);
        area.addEventListener("touchstart", onTouch, { passive: false });
        return () => {
            stop();
            observer.disconnect();
            resizeObserver.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            area.removeEventListener("pointerdown", onDown);
            area.removeEventListener("pointermove", onMove);
            area.removeEventListener("pointerup", onUp);
            area.removeEventListener("pointercancel", onUp);
            area.removeEventListener("touchstart", onTouch);
        };
    }, [host]);

    return <canvas ref={canvasRef} className="bikeCanvas" aria-hidden="true" />;
}

interface Colors { frame: string, wheel: string, rider: string }
const readColors = (el: Element): Colors => {
    const style = getComputedStyle(el);
    return { frame: style.getPropertyValue("--accent").trim(), wheel: style.getPropertyValue("--muted").trim(), rider: style.getPropertyValue("--text").trim() };
};

type P = { x: number, y: number };
/** Knee of a two-segment leg from hip to foot, bending forwards. */
function knee(hip: P, foot: P, thigh: number, shin: number): P {
    const dx = foot.x - hip.x, dy = foot.y - hip.y, d = Math.min(Math.hypot(dx, dy), thigh + shin - 0.01);
    const along = Math.atan2(dy, dx), bend = Math.acos((thigh * thigh + d * d - shin * shin) / (2 * thigh * d));
    return { x: hip.x + Math.cos(along - bend) * thigh, y: hip.y + Math.sin(along - bend) * thigh };
}

/** The bike and its rider from the side, in the site's style: thin lines, the frame in the accent colour. */
function drawBike(ctx: CanvasRenderingContext2D, b: BikeBody, turn: number, armsUp: number, c: Colors) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.scale(SIZE, SIZE);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const line = (points: P[], color: string, width: number, alpha = 1) => {
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.globalAlpha = 1;
    };

    // Geared: the cranks go round faster than the wheels.
    const crank = turn * 1.1 / SIZE, bb = { x: -2, y: 3 }, hip = { x: -6, y: -27 }, shoulder = { x: 6, y: -42 };
    const pedal = (phase: number) => ({ x: bb.x + Math.cos(crank + phase) * 6, y: bb.y + Math.sin(crank + phase) * 6 });

    // Far leg first, faded, behind the bike.
    const farFoot = pedal(Math.PI);
    line([hip, knee(hip, farFoot, 15, 15), farFoot], c.rider, 2.2, 0.35);

    // Wheels with turning spokes.
    for (const axle of [{ x: -17, y: 0 }, { x: 17, y: 0 }]) {
        ctx.beginPath();
        ctx.arc(axle.x, axle.y, 11, 0, Math.PI * 2);
        ctx.strokeStyle = c.wheel;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        for (let k = 0; k < 3; k++) {
            const a = turn + (k * Math.PI) / 3;
            line([{ x: axle.x - Math.cos(a) * 10, y: axle.y - Math.sin(a) * 10 }, { x: axle.x + Math.cos(a) * 10, y: axle.y + Math.sin(a) * 10 }], c.wheel, 0.6, 0.6);
        }
    }

    // Frame, fork, saddle and handlebar.
    const rear = { x: -17, y: 0 }, front = { x: 17, y: 0 }, seat = { x: -7, y: -21 }, head = { x: 12, y: -19 }, headLow = { x: 11, y: -12 };
    line([rear, bb, seat, rear], c.frame, 2);
    line([seat, head, headLow, bb], c.frame, 2);
    line([head, front], c.frame, 2);
    line([{ x: -11, y: -23 }, { x: -3, y: -23 }], c.rider, 2.6);
    line([head, { x: 14, y: -24 }, { x: 19, y: -23 }], c.rider, 1.8);
    line([pedal(0), pedal(Math.PI)], c.wheel, 1.6);

    // Rider: torso, arm to the handlebar, near leg on the pedal, head with a helmet.
    line([hip, shoulder], c.rider, 3);
    // Hands on the bars while riding, thrown up in the air when it flies.
    const mix = (a: P, b: P) => ({ x: a.x + (b.x - a.x) * armsUp, y: a.y + (b.y - a.y) * armsUp });
    line([shoulder, mix({ x: 13, y: -32 }, { x: 10, y: -55 }), mix({ x: 18, y: -24 }, { x: 13, y: -67 })], c.rider, 2.2);
    if (armsUp > 0.05) {
        line([shoulder, mix(shoulder, { x: 1, y: -55 }), mix(shoulder, { x: -2, y: -67 })], c.rider, 2.2, armsUp * 0.45); // far arm
    }
    const nearFoot = pedal(0);
    line([hip, knee(hip, nearFoot, 15, 15), nearFoot], c.rider, 2.4);
    ctx.beginPath();
    ctx.arc(10, -49, 4.6, 0, Math.PI * 2);
    ctx.fillStyle = c.rider;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(10, -49.5, 5.6, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = c.frame;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();
}
