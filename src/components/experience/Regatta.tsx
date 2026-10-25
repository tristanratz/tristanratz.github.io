import { RefObject, useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../env";
import { Boat, BOAT_COLORS as COLORS, BOAT_KNOT, RegattaSim, WIND_KNOT, ZOOM } from "./regattaPhysics";
import { Sea, SLOPE, Wake } from "./sea";
import { WaterGL } from "./waterGL";

/**
 * Sailboats behind the timeline. The pointer (or a finger) is the wind: it blows outwards from wherever
 * it is, and without it the boats slowly lose way. The wind shows across the whole section: isotachs
 * (rings of equal wind speed) around the pointer, streaks flying with it, and the sea (sea.ts, drawn by
 * waterGL.ts): the boats ride its waves, are pushed and turned by them, and leave wakes in it.
 * Each boat sails for its buoy (in the boat's colour), trims its sail to the wind and beats upwind in
 * tacks; once there, it picks a new buoy. Drawn in the site's style, with soft shadows: the sail
 * stands higher than the hull, so its shadow falls further away, more so when the boat heels.
 * The physics live in regattaPhysics.ts.
 */

const SVG = "http://www.w3.org/2000/svg";
// A modern keelboat from above: fine bow, widest aft of the middle, flat transom.
const HULL = "M18 0C15 -4.2 8 -6.8 -2 -7.2L-14.5 -6.4Q-15.4 0 -14.5 6.4L-2 7.2C8 6.8 15 4.2 18 0Z";
const MAST = 5, BOOM = 22, MAST_HEIGHT = 30; // px; the masthead's reach when the boat lies flat
// Shadows, cast by the light the water is lit with (waterGL.ts): by day the sun high in the upper
// left, by night a big city low on the left, so they fall long to the right. The sail stands higher
// than the hull, so its shadow falls further.
// How the boats themselves are lit: from the side facing the light (its direction, from the boat,
// in the page's coordinates), white sun by day, warm city light by night with the far side in the dark.
const LIGHTING = {
    day: {
        toward: Math.atan2(-0.55, -0.45),
        deck: ["#ffffff", "#d3d9e4"], sail: ["#ffffff", "#d0d7e2"], hullShade: 0.25,
        cabin: "#f4f5f7", windows: "rgba(20, 35, 60, 0.55)", lamps: 0,
    },
    night: {
        toward: Math.atan2(-0.12, -0.92),
        deck: ["#ffd3a0", "#2a303b"], sail: ["#ffddb0", "#39414f"], hullShade: 0.7,
        cabin: "#4b525e", windows: "#ffcf7a", lamps: 1,
    },
};
// Navigation lights (in the boat's own frame): red to port, green to starboard, white astern.
const NAV_LIGHTS = [
    { x: 12, y: -4.4, color: "#ff3b3b" },
    { x: 12, y: 4.4, color: "#2fe07a" },
    { x: -14.9, y: 0, color: "#fff4dc" },
];
/** Mixes two #rrggbb colours. */
const mixColor = (a: string, b: string, t: number) => {
    const ca = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16)), cb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
    return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * t)).join(", ")})`;
};

const SHADOWS = {
    day: { hull: { x: 3, y: 4 }, sail: { x: 9, y: 12 } },
    night: { hull: { x: 7, y: 1 }, sail: { x: 22, y: 3 } },
};
const DEG = 180 / Math.PI;
const ISOTACHS = [2, 4, 8, 16]; // knots

const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, parent?: Element) => {
    const node = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    parent?.appendChild(node);
    return node;
};

/** Side of the segment a→b towards `side` (+1: +y in the boat's frame), as a unit normal. */
function normal(ax: number, ay: number, bx: number, by: number, side: number) {
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let nx = -(by - ay) / len, ny = (bx - ax) / len;
    if (Math.sign(ny || 1) !== side) { nx = -nx; ny = -ny; }
    return { nx, ny };
}

/**
 * A sail seen from above. Upright, only its foot shows: a curve from the tack along the boom, bellied
 * to leeward. Heeling tips the mast over, so the head swings out to leeward and the sail opens up into
 * a triangle; the more the boat heels (or rolls on a wave), the more of it you see.
 */
function sailShape(tack: number, length: number, boom: number, headX: number, headY: number, belly: number) {
    const angle = Math.PI - boom;
    const cx = tack + Math.cos(angle) * length, cy = Math.sin(angle) * length;
    const hx = headX, hy = headY;
    // The belly fills on whichever side the wind pushes it and passes smoothly through flat while
    // the boom swings across in a tack, rather than flipping over.
    const bag = belly * leanSide(boom);
    const leech = normal(hx, hy, cx, cy, 1), foot = normal(tack, 0, cx, cy, 1);
    const lx = (hx + cx) / 2 + leech.nx * bag * 0.5, ly = (hy + cy) / 2 + leech.ny * bag * 0.5;
    const fx = (tack + cx) / 2 + foot.nx * bag, fy = cy / 2 + foot.ny * bag;
    const n = (v: number) => v.toFixed(1);
    return `M${n(tack)} 0L${n(hx)} ${n(hy)}Q${n(lx)} ${n(ly)} ${n(cx)} ${n(cy)}Q${n(fx)} ${n(fy)} ${n(tack)} 0Z`;
}

/**
 * Which side the boat leans to from the wind, -1..1: the side the boom is out on. It follows the boom
 * as it swings across in a tack or gybe, so the boat comes upright and leans over the other way
 * instead of flipping.
 */
const leanSide = (boom: number) => Math.max(-1, Math.min(1, boom / 0.35));

/** How far the boat leans (radians, +: towards starboard): heel from the wind to leeward, roll from the waves. */
const tiltOf = (b: Boat) => leanSide(b.boom) * b.heel * 0.7 + b.roll; // up to ~40° of heel

// Mainsail on the boom, jib from the bow to the masthead, sheeted a little tighter.
/** Where the masthead is seen from above: out to the side as the boat leans, aft as the bow lifts. */
// The mast is long, so small movements of the hull swing its top a long way: exaggerated a little.
const mastheadOf = (b: Boat) => ({
    x: MAST - Math.sin(Math.max(-0.7, Math.min(0.7, b.pitch * 1.7))) * MAST_HEIGHT,
    y: Math.sin(Math.max(-1.1, Math.min(1.1, tiltOf(b) * 1.15))) * MAST_HEIGHT,
});

/** Battens: short stiffeners across the mainsail's leech, which show its shape in the light. */
function battensPath(b: Boat) {
    const head = mastheadOf(b), angle = Math.PI - b.boom;
    const clew = { x: MAST + Math.cos(angle) * BOOM, y: Math.sin(angle) * BOOM };
    return [0.3, 0.55, 0.8].map((t) => {
        const lx = MAST + (head.x - MAST) * t, ly = head.y * t;                      // on the luff
        const ex = head.x + (clew.x - head.x) * (1 - t), ey = head.y + (clew.y - head.y) * (1 - t); // on the leech
        const sx = lx + (ex - lx) * 0.55, sy = ly + (ey - ly) * 0.55;
        return `M${sx.toFixed(1)} ${sy.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
    }).join("");
}

function sailPath(b: Boat) {
    const head = mastheadOf(b), belly = (4 + b.heel * 3) * (1 - b.luff * 0.8);
    return sailShape(MAST, BOOM, b.boom, head.x, head.y, belly)
        + sailShape(15, 13, b.boom * 0.8, MAST + (head.x - MAST) * 0.85, head.y * 0.85, belly * 0.6);
}

interface Parts {
    hullShadow: SVGPathElement; sailShadow: SVGPathElement;
    shading: SVGLinearGradientElement[]; // turned towards the light every frame
    colours: { stops: SVGStopElement[], role: "deck" | "sail" | "hull" }[];
    cabin: SVGRectElement; windows: SVGRectElement[];
    lamps: SVGGElement; reflections: SVGGElement;
    wake: SVGPathElement;
    hull: SVGGElement; deck: SVGGElement; sail: SVGPathElement; battens: SVGPathElement; mast: SVGPathElement; boom: SVGPathElement;
    buoy: SVGGElement; ring: SVGCircleElement;
    log: SVGTextElement;
}

/** How long the regatta takes to fade out when switched off (ms; matches the CSS). */
export const REGATTA_FADE = 600;

interface Props {
    section: RefObject<HTMLElement>;
    onScore?: (scores: number[]) => void;
    /** Fading out before being removed. */
    leaving?: boolean;
}

export function Regatta({ section, onScore, leaving = false }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const waterRef = useRef<HTMLCanvasElement>(null);
    const scoreRef = useRef(onScore);
    scoreRef.current = onScore;

    useEffect(() => {
        const svg = svgRef.current!, host = section.current!, canvas = waterRef.current!;
        if (prefersReducedMotion()) return;
        const sim = new RegattaSim(host.clientWidth, host.clientHeight, 5);
        if (import.meta.env.DEV) (window as unknown as { regatta: RegattaSim }).regatta = sim; // for debugging

        const sea = new Sea(sim.width, sim.height);
        const water = new WaterGL(canvas);
        let waveSources: Wake[] = []; // the boats' ring waves in the sea
        // Light or dark theme, re-read when it changes (not every frame).
        const readScheme = () => getComputedStyle(document.documentElement).colorScheme === "dark";
        let night = readScheme();
        const onScheme = () => { night = readScheme(); };
        const themeWatch = new MutationObserver(onScheme);
        themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        const scheme = window.matchMedia("(prefers-color-scheme: dark)");
        scheme.addEventListener("change", onScheme);
        const dark = () => night;

        // Scene graph (above the water canvas): isotachs, shadows, wakes, buoys, boats, speed logs
        // and the wind streaks on top.
        const defs = el("defs", {}, svg);
        const blur = el("filter", { id: "regattaBlur", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
        el("feGaussianBlur", { stdDeviation: 2.2 }, blur);
        const glow = el("filter", { id: "regattaGlow", x: "-200%", y: "-200%", width: "500%", height: "500%" }, defs);
        el("feGaussianBlur", { stdDeviation: 1.6 }, glow);
        const shine = el("filter", { id: "regattaShine", x: "-200%", y: "-200%", width: "500%", height: "500%" }, defs);
        el("feGaussianBlur", { stdDeviation: 4 }, shine);
        const layer = (name: string) => el("g", { class: name }, svg);
        const isobars = layer("isotachs");
        const reflections = layer("reflections");
        const shadows = layer("shadows"), wakes = layer("wakes"), buoys = layer("buoys"), boats = layer("boats"), splash = layer("spray"), logs = layer("logs"), air = layer("air");
        shadows.setAttribute("filter", "url(#regattaBlur)");

        const parts: Parts[] = sim.boats.map((_, i) => {
            const color = COLORS[i % COLORS.length];
            const buoy = el("g", {}, buoys);
            const ring = el("circle", { r: 6, fill: "none", stroke: color, "stroke-width": 1.2 }, buoy);
            el("circle", { r: 4.5, cx: 1.5, cy: 2, class: "hullShadow" }, buoy);
            el("circle", { r: 4.5, fill: color, stroke: "#fff", "stroke-width": 1.5 }, buoy);
            // Boats as they really look: a painted hull, white deck and white sails, shaded by the light
            // from the upper left; the boat's colour is on its hull (and its log).
            const id = `regatta${i}`;
            // Gradients that are turned towards the light every frame, so each boat is lit from the same
            // side whichever way it points.
            const gradient = (name: string) => {
                const g = el("linearGradient", { id: `${id}${name}` }, defs);
                return { g, stops: [el("stop", { offset: 0 }, g), el("stop", { offset: 1 }, g)] };
            };
            const hullShade = gradient("Hull"), deckShade = gradient("Deck"), sailShade = gradient("Sail");
            const hull = el("g", {}, boats);
            // Topsides (the hull's painted side): they show on the windward side as the deck leans away.
            el("path", { d: HULL, fill: `url(#${id}Hull)`, stroke: "rgba(15, 25, 45, 0.5)", "stroke-width": 0.7, "stroke-linejoin": "round" }, hull);
            const deck = el("g", {}, hull); // shifts to leeward and narrows as the boat leans over
            el("path", { d: HULL, fill: `url(#${id}Deck)`, stroke: "rgba(15, 25, 45, 0.35)", "stroke-width": 0.6, "stroke-linejoin": "round" }, deck);
            el("path", { d: HULL, fill: "none", stroke: color, "stroke-width": 0.9, "stroke-opacity": 0.9, transform: "scale(0.94 0.86)" }, deck); // toe rail stripe
            const cabin = el("rect", { x: -4, y: -4, width: 13, height: 8, rx: 3.5, stroke: "rgba(15, 25, 45, 0.25)", "stroke-width": 0.5 }, deck); // cabin top
            const windows = [-3.6, 2.6].map((y) => el("rect", { x: -2.5, y, width: 9, height: 1, rx: 0.5 }, deck));
            el("rect", { x: -13.4, y: -3.8, width: 8.4, height: 7.6, rx: 1.6, fill: "#b98b5e" }, deck); // teak cockpit
            el("path", { d: "M-13 -1.9H-5.4M-13 0H-5.4M-13 1.9H-5.4", stroke: "rgba(70, 45, 20, 0.45)", "stroke-width": 0.35 }, deck);
            const boom = el("path", { stroke: "#5b6270", "stroke-width": 1.1, "stroke-linecap": "round", fill: "none" }, hull);
            const sail = el("path", { fill: `url(#${id}Sail)`, stroke: "rgba(20, 30, 50, 0.4)", "stroke-width": 0.6, "stroke-linejoin": "round" }, hull);
            const battens = el("path", { stroke: "rgba(20, 30, 50, 0.22)", "stroke-width": 0.5, "stroke-linecap": "round", fill: "none" }, hull);
            const mast = el("path", { stroke: "#4a505c", "stroke-width": 1.3, "stroke-linecap": "round", fill: "none" }, hull);
            // Navigation lights: a lamp with a halo on the boat, and their shine on the water around it.
            const lamps = el("g", {}, hull);
            const shineOnWater = el("g", {}, reflections);
            for (const light of NAV_LIGHTS) {
                el("circle", { cx: light.x, cy: light.y, r: 3.2, fill: light.color, filter: "url(#regattaGlow)", class: "halo" }, lamps);
                el("circle", { cx: light.x, cy: light.y, r: 0.85, fill: light.color }, lamps);
                el("circle", { cx: light.x * 1.15, cy: light.y * 1.9, r: 7, fill: light.color, filter: "url(#regattaShine)" }, shineOnWater);
            }
            return {
                hullShadow: el("path", { d: HULL, class: "hullShadow" }, shadows),
                sailShadow: el("path", { class: "sailShadow" }, shadows),
                wake: el("path", { fill: "none", stroke: color, "stroke-width": 1.4, "stroke-linecap": "round", "stroke-opacity": 0.35 }, wakes),
                hull, deck, sail, battens, mast, boom, buoy, ring,
                shading: [hullShade.g, deckShade.g, sailShade.g],
                colours: [{ stops: hullShade.stops, role: "hull" }, { stops: deckShade.stops, role: "deck" }, { stops: sailShade.stops, role: "sail" }],
                cabin, windows, lamps, reflections: shineOnWater,
                log: el("text", { class: "log", fill: color }, logs),
            };
        });

        // Isotachs: lines of equal wind speed. The wind blows outwards from the pointer and weakens
        // with distance, so they're circles around it; labelled in knots.
        const rings = ISOTACHS.map((knots) => ({
            knots,
            circle: el("circle", { class: "isotach" }, isobars),
            label: el("text", { class: "isotachLabel" }, isobars),
        }));

        // Wind streaks: short dashes across the whole visible water, flying with the wind;
        // more and longer where it blows harder.
        const streaks = Array.from({ length: 80 }, () => ({
            x: 0, y: 0, age: 1, life: 1,
            line: el("line", { stroke: COLORS[0], "stroke-width": 1.2, "stroke-linecap": "round", opacity: 0 }, air),
        }));
        let nextStreak = 0, release = 0;

        // Only the part of the section on screen needs drawing.
        let view = { top: 0, bottom: 0 };
        const measure = () => {
            const r = host.getBoundingClientRect();
            view = { top: -r.top - 40, bottom: -r.top + window.innerHeight + 40 };
        };

        let lastLighting: typeof LIGHTING.day | null = null;
        const draw = () => {
            // Water: only the part on screen, with the canvas moved along to cover it.
            const top = Math.max(0, view.top), bottom = Math.min(sim.height, view.bottom);
            if (bottom > top) {
                canvas.style.top = `${top}px`;
                canvas.style.height = `${bottom - top}px`;
                water.render(sea, sim.time, waveSources, sim.boats, top, sim.width, bottom - top, sim.height, dark());
            }

            const origin = sim.origin;
            for (const ring of rings) {
                const r = origin && sim.sourceStrength > 0.02 ? sim.isotach(ring.knots) : null;
                if (!r || !origin) { ring.circle.setAttribute("r", "0"); ring.label.textContent = ""; continue; }
                ring.circle.setAttribute("cx", origin.x.toFixed(1));
                ring.circle.setAttribute("cy", origin.y.toFixed(1));
                ring.circle.setAttribute("r", r.toFixed(1));
                ring.circle.setAttribute("opacity", Math.min(1, sim.sourceStrength).toFixed(2));
                // Label on the ring towards the upper right, kept on screen where possible.
                const a = -0.7;
                ring.label.setAttribute("x", (origin.x + Math.cos(a) * r).toFixed(1));
                ring.label.setAttribute("y", (origin.y + Math.sin(a) * r).toFixed(1));
                ring.label.setAttribute("opacity", Math.min(1, sim.sourceStrength).toFixed(2));
                ring.label.textContent = `${ring.knots} kn`;
            }

            const light = dark() ? SHADOWS.night : SHADOWS.day;
            const lit = dark() ? LIGHTING.night : LIGHTING.day;
            if (lit !== lastLighting) {
                lastLighting = lit;
                parts.forEach((p, i) => {
                    const color = COLORS[i % COLORS.length];
                    for (const { stops, role } of p.colours) {
                        const [bright, dim] = role === "hull" ? [color, mixColor(color, "#000000", lit.hullShade)] : lit[role];
                        stops[0].setAttribute("stop-color", bright);
                        stops[1].setAttribute("stop-color", dim);
                    }
                    p.cabin.setAttribute("fill", lit.cabin);
                    p.windows.forEach((w) => w.setAttribute("fill", lit.windows));
                    // By day the lamps are off (just their housings); at night they shine.
                    p.lamps.querySelectorAll(".halo").forEach((h) => h.setAttribute("opacity", String(lit.lamps * 0.9)));
                    p.lamps.setAttribute("opacity", lit.lamps ? "1" : "0.55");
                    p.reflections.setAttribute("opacity", String(lit.lamps * 0.4));
                });
            }
            sim.boats.forEach((b, i) => {
                // Riding the waves: lifted on a crest (a touch larger, its shadow further off), leaning
                // over with heel and roll, so the deck narrows and the masthead swings out.
                // Up on a crest a boat is nearer, so a little larger, and its shadow falls further;
                // pitching shortens it as seen from above.
                const tilt = tiltOf(b), heave = 1 + Math.max(-0.03, Math.min(0.03, b.lift * 0.02));
                const p = parts[i], rotate = `rotate(${(b.heading * DEG).toFixed(1)})`;
                p.hull.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) ${rotate} scale(${(heave * ZOOM).toFixed(3)})`);
                p.reflections.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) ${rotate} scale(${ZOOM})`);
                // Turn the shading towards the light: bright on the side facing it, dim away from it.
                const towards = lit.toward - b.heading, gx = Math.cos(towards) * 0.5, gy = Math.sin(towards) * 0.5;
                for (const g of p.shading) {
                    g.setAttribute("x1", (0.5 + gx).toFixed(3)); g.setAttribute("y1", (0.5 + gy).toFixed(3));
                    g.setAttribute("x2", (0.5 - gx).toFixed(3)); g.setAttribute("y2", (0.5 - gy).toFixed(3));
                }
                p.deck.setAttribute("transform", `translate(0 ${(Math.sin(tilt) * 3.5).toFixed(2)}) scale(${Math.cos(b.pitch).toFixed(3)} ${Math.cos(tilt).toFixed(3)})`);
                const boomAngle = Math.PI - b.boom;
                p.boom.setAttribute("d", `M${MAST} 0L${(MAST + Math.cos(boomAngle) * BOOM).toFixed(1)} ${(Math.sin(boomAngle) * BOOM).toFixed(1)}`);
                const sail = sailPath(b);
                p.sail.setAttribute("d", sail);
                p.battens.setAttribute("d", battensPath(b));
                const head = mastheadOf(b);
                p.mast.setAttribute("d", `M${MAST} 0L${head.x.toFixed(1)} ${head.y.toFixed(1)}`);
                const rise = 1 + (heave - 1) * 8;
                p.hullShadow.setAttribute("transform", `translate(${(b.x + light.hull.x * ZOOM * rise).toFixed(1)} ${(b.y + light.hull.y * ZOOM * rise).toFixed(1)}) ${rotate} scale(${ZOOM})`);
                p.sailShadow.setAttribute("d", sail);
                p.sailShadow.setAttribute("transform",
                    `translate(${(b.x + light.sail.x * ZOOM * rise).toFixed(1)} ${(b.y + light.sail.y * ZOOM * rise).toFixed(1)}) ${rotate} scale(${ZOOM})`);

                // A faint foam track behind the boat (its waves are part of the water, waterGL.ts).
                const trail = [{ x: b.x - Math.cos(b.heading) * 15 * ZOOM, y: b.y - Math.sin(b.heading) * 15 * ZOOM }, ...b.trail.slice(1)];
                p.wake.setAttribute("d", trail.map((t, k) => `${k ? "L" : "M"}${t.x.toFixed(1)} ${t.y.toFixed(1)}`).join(""));
                p.wake.setAttribute("stroke-opacity", Math.min(0.18, b.speed / 120).toFixed(2));

                // Speed log beside the boat, on the side away from its sail.
                const knots = b.speed / BOAT_KNOT, away = -Math.sign(b.boom || 1);
                p.log.setAttribute("x", (b.x - Math.sin(b.heading) * 18 * ZOOM * away).toFixed(1));
                p.log.setAttribute("y", (b.y + Math.cos(b.heading) * 18 * ZOOM * away + 3).toFixed(1));
                p.log.textContent = `${knots.toFixed(1)} kn`;
                p.log.setAttribute("opacity", knots < 0.1 ? "0.35" : "0.85");

                p.buoy.setAttribute("transform", `translate(${b.target.x.toFixed(1)} ${b.target.y.toFixed(1)})`);
                const pulse = (sim.time * 0.7 + i * 0.2) % 1;
                p.ring.setAttribute("r", (6 + pulse * 12).toFixed(1));
                p.ring.setAttribute("stroke-opacity", (0.5 * (1 - pulse)).toFixed(2));
            });
            for (const d of spray) {
                const t = d.age / d.life;
                if (t >= 1) { d.drop.setAttribute("opacity", "0"); continue; }
                d.drop.setAttribute("cx", d.x.toFixed(1));
                d.drop.setAttribute("cy", d.y.toFixed(1));
                d.drop.setAttribute("opacity", (0.85 * (1 - t)).toFixed(2));
            }
            for (const c of confetti) {
                const t = c.age / c.life;
                if (t >= 1) { c.piece.setAttribute("opacity", "0"); continue; }
                // Seen from above, a piece flips as it tumbles: its width pulses.
                const flip = Math.abs(Math.cos(c.angle / 40));
                c.piece.setAttribute("transform", `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${c.angle.toFixed(0)}) scale(${(0.4 + flip * 0.6).toFixed(2)} 1)`);
                c.piece.setAttribute("opacity", (t < 0.7 ? 1 : (1 - t) / 0.3).toFixed(2));
            }
            for (const streak of streaks) {
                const t = streak.age / streak.life;
                if (t >= 1) { streak.line.setAttribute("opacity", "0"); continue; }
                const w = sim.windAt(streak.x, streak.y), len = Math.min(22, 4 + Math.hypot(w.x, w.y) / 7);
                const n = Math.hypot(w.x, w.y) || 1;
                streak.line.setAttribute("x1", streak.x.toFixed(1));
                streak.line.setAttribute("y1", streak.y.toFixed(1));
                streak.line.setAttribute("x2", (streak.x - (w.x / n) * len).toFixed(1));
                streak.line.setAttribute("y2", (streak.y - (w.y / n) * len).toFixed(1));
                streak.line.setAttribute("opacity", (Math.sin(t * Math.PI) * 0.35).toFixed(2));
            }
        };

        // Confetti for a boat that reaches its buoy: a burst of little pieces in its colour (and some
        // others), slowed by the air, spinning, fading as they settle.
        const confetti = Array.from({ length: 90 }, () => ({
            x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, age: 1, life: 1,
            piece: el("rect", { width: 5, height: 3, x: -2.5, y: -1.5, rx: 0.8, opacity: 0 }, air),
        }));
        let nextPiece = 0;
        const celebrate = (b: Boat, color: string) => {
            for (let n = 0; n < 28; n++) {
                const piece = confetti[nextPiece++ % confetti.length], angle = Math.random() * Math.PI * 2;
                const speed = 60 + Math.random() * 120;
                Object.assign(piece, {
                    x: b.x, y: b.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30,
                    angle: Math.random() * 360, spin: (Math.random() - 0.5) * 900, age: 0, life: 0.9 + Math.random() * 0.7,
                });
                piece.piece.setAttribute("fill", Math.random() < 0.6 ? color : COLORS[Math.floor(Math.random() * COLORS.length)]);
            }
        };
        const scores = sim.boats.map((b) => b.score);

        // Spray: droplets thrown off to both sides of the bow, more the faster a boat goes, and in
        // bursts, flying further, when its bow slams into a wave.
        const spray = Array.from({ length: 260 }, () => ({
            x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1,
            drop: el("circle", { r: 1, fill: "#fff", opacity: 0 }, splash),
        }));
        let nextDrop = 0;
        const sprayDebt = sim.boats.map(() => 0);
        const throwSpray = (dt: number) => {
            sim.boats.forEach((b, i) => {
                const dipping = Math.max(0, -b.pitch) * 6;
                // Steady spray at speed, and bursts when the bow slams into a wave.
                const slam = Math.min(4, b.slam * 6);
                sprayDebt[i] += (Math.max(0, b.speed - 28) * 0.9 * (1 + dipping) + slam * 45) * dt;
                const c = Math.cos(b.heading), n = Math.sin(b.heading);
                while (sprayDebt[i] >= 1) {
                    sprayDebt[i] -= 1;
                    const side = Math.random() < 0.5 ? -1 : 1, along = (12 + Math.random() * 5) * ZOOM, across = side * (2 + Math.random() * 4) * ZOOM;
                    const out = (35 + Math.random() * 70) * (1 + slam * 0.35), ahead = b.speed * (0.3 + Math.random() * 0.4);
                    const d = spray[nextDrop++ % spray.length];
                    Object.assign(d, {
                        x: b.x + c * along - n * across, y: b.y + n * along + c * across,
                        vx: c * ahead - n * side * out, vy: n * ahead + c * side * out,
                        age: 0, life: 0.3 + Math.random() * 0.45,
                    });
                    d.drop.setAttribute("r", ((0.5 + Math.random() * 0.9) * (1 + slam * 0.15)).toFixed(2));
                }
            });
            for (const d of spray) {
                if (d.age >= d.life) continue;
                const drag = Math.exp(-dt * 5);
                d.vx *= drag; d.vy *= drag;
                d.x += d.vx * dt; d.y += d.vy * dt;
                d.age += dt;
            }
        };

        let scored = 0;
        const step = (dt: number) => {
            sim.step(dt);
            sea.update(sim, dt, sim.width / 2, (view.top + view.bottom) / 2);
            waveSources = sea.wakes(sim);
            // The waves act on the boats: they slide down the slopes, the bow is pushed aside, and they
            // roll towards the lower side; other boats' wakes count too.
            sim.boats.forEach((b, i) => {
                const s = sea.heightAt(b.x, b.y, sim.time, waveSources.filter((w) => w.boat !== i));
                const c = Math.cos(b.heading), n = Math.sin(b.heading);
                const across = -n * s.gx + c * s.gy; // rise of the water towards starboard
                b.x -= s.gx * 40 * dt;
                b.y -= s.gy * 40 * dt;
                b.heading -= across * 2.2 * dt;
                const roll = Math.max(-0.5, Math.min(0.5, -across * 5));
                b.roll += (roll - b.roll) * (1 - Math.exp(-dt / 0.3));
                // Heave and pitch follow the surface with a little inertia: the boat rises on a crest and
                // its bow lifts as it climbs a wave, then drops into the trough behind it.
                const along = c * s.gx + n * s.gy; // rise of the water ahead
                const pitch = Math.max(-0.45, Math.min(0.45, Math.atan(along * SLOPE)));
                const follow = 1 - Math.exp(-dt / 0.18);
                // Driving into a rising wave face makes the bow slam into it.
                b.slam = Math.max(0, along * SLOPE) * (b.speed / 40);
                b.pitch += (pitch - b.pitch) * follow;
                b.heave += (s.h - b.heave) * follow;
                // How high it sits, for drawing: slow and smooth, so it doesn't pulse with every ripple.
                b.lift += (b.heave - b.lift) * (1 - Math.exp(-dt / 0.8));
            });
            sim.boats.forEach((b, i) => {
                if (b.score > scores[i]) celebrate(b, COLORS[i % COLORS.length]);
                scores[i] = b.score;
            });
            for (const c of confetti) {
                if (c.age >= c.life) continue;
                const drag = Math.exp(-dt * 3);
                c.vx *= drag; c.vy *= drag;
                c.x += c.vx * dt; c.y += c.vy * dt;
                c.angle += c.spin * dt;
                c.age += dt;
            }
            throwSpray(dt);
            const total = sim.boats.reduce((sum, b) => sum + b.score, 0);
            if (total !== scored) { scored = total; scoreRef.current?.(sim.boats.map((b) => b.score)); }
            measure();
            release += dt;
            while (release > 0.02) {
                release -= 0.02;
                // Try a random spot on screen; it gets a streak with a chance that grows with the wind.
                const x = Math.random() * sim.width;
                const y = Math.max(0, view.top) + Math.random() * (Math.min(sim.height, view.bottom) - Math.max(0, view.top));
                const w = sim.windAt(x, y), knots = Math.hypot(w.x, w.y) / WIND_KNOT;
                if (Math.random() > Math.min(1, knots / 10)) continue;
                const streak = streaks[nextStreak++ % streaks.length];
                Object.assign(streak, { x, y, age: 0, life: 0.8 + Math.random() * 0.8 });
            }
            for (const streak of streaks) {
                if (streak.age >= streak.life) continue;
                const w = sim.windAt(streak.x, streak.y);
                streak.x += w.x * dt * 1.6;
                streak.y += w.y * dt * 1.6;
                streak.age += dt;
            }
        };

        // The pointer is the wind source while it's over the section.
        const onMove = (e: PointerEvent) => {
            const r = host.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            sim.source = inside ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
        };
        const onLeave = () => { sim.source = null; };
        // On touch screens the finger is the wind while it touches the section, also while scrolling.
        const onTouch = (e: TouchEvent) => {
            const touch = e.touches[0], r = host.getBoundingClientRect();
            if (touch) sim.source = { x: touch.clientX - r.left, y: touch.clientY - r.top };
        };

        let frame = 0, previous = 0;
        const loop = (now: number) => {
            frame = requestAnimationFrame(loop);
            const dt = previous ? Math.min(0.05, (now - previous) / 1000) : 0;
            previous = now;
            if (dt) step(dt);
            draw();
        };
        const start = () => { if (!frame && !document.hidden) { previous = 0; frame = requestAnimationFrame(loop); } };
        const stop = () => { cancelAnimationFrame(frame); frame = 0; };
        let visible = false;
        const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop(); });
        observer.observe(host);
        const onVisibility = () => (document.hidden ? stop() : visible && start());
        document.addEventListener("visibilitychange", onVisibility);
        const resize = new ResizeObserver(() => {
            sim.resize(host.clientWidth, host.clientHeight);
            sea.resize(host.clientWidth, host.clientHeight);
            measure();
            draw();
        });
        resize.observe(host);
        window.addEventListener("pointermove", onMove, { passive: true });
        document.documentElement.addEventListener("mouseleave", onLeave);
        host.addEventListener("touchstart", onTouch, { passive: true });
        host.addEventListener("touchmove", onTouch, { passive: true });
        host.addEventListener("touchend", onLeave);
        host.addEventListener("touchcancel", onLeave);
        measure();
        draw();

        return () => {
            stop();
            observer.disconnect();
            resize.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pointermove", onMove);
            document.documentElement.removeEventListener("mouseleave", onLeave);
            host.removeEventListener("touchstart", onTouch);
            host.removeEventListener("touchmove", onTouch);
            host.removeEventListener("touchend", onLeave);
            host.removeEventListener("touchcancel", onLeave);
            themeWatch.disconnect();
            scheme.removeEventListener("change", onScheme);
            svg.replaceChildren();
        };
    }, [section]);

    return (
        <>
            <canvas ref={waterRef} className={"regattaWater" + (leaving ? " leaving" : "")} aria-hidden="true" />
            <svg ref={svgRef} className={"regatta" + (leaving ? " leaving" : "")} aria-hidden="true" />
        </>
    );
}
