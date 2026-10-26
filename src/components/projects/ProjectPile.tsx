import { useEffect, useRef } from "react";
import { IoLink, IoLogoGithub } from "react-icons/io5";
import { useIsomorphicLayoutEffect } from "../../env";
import { useUi } from "../../i18n";
import { ProjectData } from "../../store/projects";
import { Box, DT, Pile } from "./pilePhysics";

/** Where a project's card is in the carousel (viewport coordinates). */
export interface Origin { left: number, top: number, width: number, height: number }

interface Props {
    projects: ProjectData[];
    /** The carousel's cards right now (it stays in the page, invisible, under the pile). */
    carousel: () => Origin[];
    /** The carousel cards' own size (unscaled): the pile's cards are those, scaled down. */
    base: { width: number, height: number };
    /** The project the carousel has in focus (its card looks active). */
    active: number;
    onOpen: (i: number) => void;
    /** Counts up: each change shakes the pile. */
    shake: number;
    /** Set: the cards float back into the carousel; `onReturned` when they're there. */
    returning: boolean;
    onReturned: () => void;
    /** The card that morphs into the project's dialog and back (it carries the shared names then). */
    morphing: number | null;
}

const BREAK = 0.55;  // s a card takes to shrink from carousel size to pile size once loose
const RETURN = 0.8;  // s back into the carousel
const ease = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * Gravity: the carousel breaks apart. Its cards come loose one after the other where they are, shrink
 * while they fall and pile up (physics in pilePhysics.ts); the ones the carousel had out of sight drop
 * in from above. They stay little project cards (the carousel's, scaled down): any can be grabbed,
 * dragged and thrown, a click without dragging opens it (morphing into the dialog, like a carousel
 * card). When gravity is switched off, they rise and
 * float back to their places in the carousel.
 */
export function ProjectPile({ projects, carousel, base, active, onOpen, shake, returning, onReturned, morphing }: Props) {
    const ui = useUi().projects;
    const roomRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const faceRefs = useRef<(HTMLElement | null)[]>([]);
    const pileRef = useRef<Pile | null>(null);
    const returnRef = useRef<(() => void) | null>(null);
    const dragged = useRef(false);
    const done = useRef(onReturned);
    done.current = onReturned;
    const activeRef = useRef(active);
    activeRef.current = active;

    // Before the first paint, so the cards appear exactly where the carousel's were.
    useIsomorphicLayoutEffect(() => {
        const room = roomRef.current!;
        const pile = new Pile();
        pileRef.current = pile;
        const r = room.getBoundingClientRect(), width = room.clientWidth, height = room.clientHeight;
        // Small enough that the whole pile takes up less than half the room.
        const small = Math.min(0.42, Math.max(0.16, Math.sqrt((0.42 * width * height) / (projects.length * base.width * base.height))));
        const w = base.width * small, h = base.height * small;
        pile.setRoom(width, height);

        // Per card: its scale and position offset (from its box) in the carousel, left behind once loose.
        const origins = carousel();
        const starts = projects.map((_, i) => {
            const o = origins[i];
            const shown = o && o.width > 0 && o.left + o.width > r.left + 10 && o.left < r.right - 10;
            if (!shown) {
                // Out of sight in the carousel: drops in from above a little later.
                const box = pile.add(new Box(w / 2 + Math.random() * (width - w), -h - Math.random() * 260, w, h));
                box.angle = (Math.random() - 0.5) * 1.2;
                box.pinnedUntil = 0.5 + Math.random() * 0.7;
                return { scale: small, dx: 0, loose: false };
            }
            const cx = o.left + o.width / 2 - r.left, cy = o.top + o.height / 2 - r.top;
            // The box (pile size) stays inside the walls; the card is drawn where it really was and
            // slides onto its box while shrinking.
            const bx = Math.min(width - w / 2 - 1, Math.max(w / 2 + 1, cx));
            const box = pile.add(new Box(bx, cy, w, h));
            box.pinnedUntil = 0.12 + Math.random() * 0.45; // they crack loose one after the other
            return { scale: o.width / base.width, dx: cx - bx, loose: false };
        });

        /** Places card i: centre, angle and scale (of the carousel card). */
        const place = (i: number, x: number, y: number, angle: number, scale: number) => {
            const card = cardRefs.current[i], face = faceRefs.current[i];
            if (!card || !face) return;
            const cw = base.width * scale, ch = base.height * scale;
            card.style.width = `${cw.toFixed(1)}px`;
            card.style.height = `${ch.toFixed(1)}px`;
            card.style.transform = `translate(${(x - cw / 2).toFixed(1)}px, ${(y - ch / 2).toFixed(1)}px) rotate(${angle.toFixed(4)}rad)`;
            face.style.transform = `scale(${scale.toFixed(4)})`;
        };
        const pose = projects.map(() => ({ x: 0, y: 0, angle: 0, scale: small }));
        const drawPile = () => {
            pile.boxes.forEach((b, i) => {
                const s = starts[i];
                if (!s.loose && pile.time >= b.pinnedUntil) {
                    // Loose: a little tip to one side as it goes, and it lights up like the active card.
                    s.loose = true;
                    b.spin = (Math.random() - 0.5) * 3;
                    b.velocity.x = (Math.random() - 0.5) * 120;
                    faceRefs.current[i]?.classList.add("active");
                }
                const t = ease(clamp01((pile.time - b.pinnedUntil) / BREAK));
                const p = { x: b.position.x + s.dx * (1 - t), y: b.position.y, angle: b.angle, scale: lerp(s.scale, small, t) };
                pose[i] = p;
                place(i, p.x, p.y, p.angle, p.scale);
            });
        };

        // Back into the carousel: from where each card is to its place there, in a slight arc
        // (lifting off), upright again; one after the other.
        let back: { from: typeof pose, to: typeof pose, start: number } | null = null;
        returnRef.current = () => {
            pile.release();
            const at = room.getBoundingClientRect();
            const to = carousel().map((o) => ({
                x: o.left + o.width / 2 - at.left, y: o.top + o.height / 2 - at.top, angle: 0, scale: o.width / base.width,
            }));
            // The nearest upright angle, so nothing spins round more than half a turn.
            const from = pose.map((p) => ({ ...p, angle: Math.atan2(Math.sin(p.angle), Math.cos(p.angle)) }));
            back = { from, to, start: performance.now() };
            faceRefs.current.forEach((face, i) => face?.classList.toggle("active", i === activeRef.current));
        };
        const drawBack = (now: number) => {
            const { from, to, start } = back!;
            let finished = true;
            from.forEach((a, i) => {
                const b = to[i];
                const t = clamp01((now - start) / 1000 / RETURN - (i % 5) * 0.04);
                if (t < 1) finished = false;
                const e = easeInOut(t);
                place(i, lerp(a.x, b.x, e), lerp(a.y, b.y, e) - Math.sin(Math.PI * e) * 60, lerp(a.angle, 0, e), lerp(a.scale, b.scale, e));
            });
            if (finished) { back = null; done.current(); }
        };

        // Grab, drag, throw; a click that didn't move opens the project (see onClick below).
        let start = { x: 0, y: 0 };
        const point = (e: PointerEvent) => {
            const at = room.getBoundingClientRect();
            return { x: e.clientX - at.left, y: e.clientY - at.top };
        };
        const onDown = (e: PointerEvent) => {
            if (e.button !== 0 || back) return;
            const i = cardRefs.current.indexOf((e.target as Element).closest<HTMLDivElement>(".pileCard"));
            if (i < 0) return;
            const p = point(e);
            pile.take(pile.boxes[i], p.x, p.y);
            start = p;
            dragged.current = false;
            cardRefs.current[i]!.setPointerCapture(e.pointerId);
            cardRefs.current[i]!.classList.add("held");
        };
        const onMove = (e: PointerEvent) => {
            if (!pile.held) return;
            const p = point(e);
            pile.held.target = p;
            if (Math.hypot(p.x - start.x, p.y - start.y) > 6) dragged.current = true;
        };
        const onUp = () => {
            if (!pile.held) return;
            cardRefs.current[pile.boxes.indexOf(pile.held.box)]?.classList.remove("held");
            pile.release();
        };

        let raf = 0, previous = 0, carry = 0;
        const loop = (now: number) => {
            raf = requestAnimationFrame(loop);
            if (back) return drawBack(now);
            carry = Math.min(carry + (previous ? (now - previous) / 1000 : 0), 0.1);
            previous = now;
            for (; carry >= DT; carry -= DT) pile.step();
            drawPile();
        };
        drawPile();
        raf = requestAnimationFrame(loop);
        const resize = new ResizeObserver(() => pile.setRoom(room.clientWidth, room.clientHeight));
        resize.observe(room);
        room.addEventListener("pointerdown", onDown);
        room.addEventListener("pointermove", onMove);
        room.addEventListener("pointerup", onUp);
        room.addEventListener("pointercancel", onUp);
        return () => {
            cancelAnimationFrame(raf);
            resize.disconnect();
            room.removeEventListener("pointerdown", onDown);
            room.removeEventListener("pointermove", onMove);
            room.removeEventListener("pointerup", onUp);
            room.removeEventListener("pointercancel", onUp);
            pileRef.current = null;
            returnRef.current = null;
        };
        // Once per gravity: the parent's re-renders (new arrays, the switch back) mustn't start it over.
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { if (shake) pileRef.current?.shake(); }, [shake]);
    useEffect(() => { if (returning) returnRef.current?.(); }, [returning]);

    return (
        <div className="projectPile" ref={roomRef}>
            {projects.map((p, i) => (
                // The whole card opens the project; its buttons are only pictures of the carousel's.
                <div key={p.slug} ref={(el) => { cardRefs.current[i] = el; }} className="pileCard" role="button" tabIndex={0}
                     aria-label={p.name}
                     onClick={() => { if (!dragged.current && !returning) onOpen(i); }}
                     onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(i); } }}>
                    <article ref={(el) => { faceRefs.current[i] = el; }} className={"projectCard pileFace" + (i === active ? " active" : "")}
                             style={{ width: base.width, height: base.height, ...(morphing === i && { viewTransitionName: "project-card" }) }}
                             aria-hidden="true">
                        <div className="cardImage" style={{ backgroundImage: `url(${p.image})`, ...(morphing === i && { viewTransitionName: "project-image" }) }}>
                            {p.aiImage && <span className="aiLabel">{ui.aiImage}</span>}
                        </div>
                        <div className="cardBody">
                            <p className="eyebrow">{p.date}</p>
                            <h3 className="serif">{p.name}</h3>
                            {p.technologies.length > 0 && <p className="tech">{p.technologies.join(" · ")}</p>}
                            <div className="cardActions">
                                <span className="readMore">{ui.readMore}</span>
                                {p.github && <span className="iconButton"><IoLogoGithub /></span>}
                                {p.link && <span className="iconButton"><IoLink /></span>}
                            </div>
                        </div>
                    </article>
                </div>
            ))}
        </div>
    );
}
