import { useEffect, useRef, useState } from "react";
import map from "virtual:project-map";
import { prefersReducedMotion } from "../../env";
import { useUi } from "../../i18n";
import { ProjectData } from "../../store/projects";

interface Props {
    projects: ProjectData[];
    onOpen: (i: number) => void;
    onFocus: (i: number) => void;
}

const links = map.flatMap((p, i) => p.neighbors.map((j) => [i, j] as const));

/**
 * Projects floating in a 2D/3D similarity space: similar projects sit close together, the third
 * dimension becomes depth (size, brightness, parallax). Everything drifts gently; the pointer tilts
 * the space and shifts the depth layers.
 */

/** Small version of a project image (made by scripts/images.sh); SVGs scale anyway. */
const thumbnail = (image: string) => (image.endsWith(".webp") ? image.replace("/img/", "/img/thumbs/") : image);
export function ProjectMap({ projects, onOpen, onFocus }: Props) {
    const ui = useUi().projects;
    const [hover, setHover] = useState<number | null>(null);
    const spaceRef = useRef<HTMLDivElement>(null);
    const pointRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const lineRefs = useRef<(SVGLineElement | null)[]>([]);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const space = spaceRef.current!;
        const still = prefersReducedMotion();
        let raf = 0, width = 0, height = 0;
        const pointer = { x: 0, y: 0, sx: 0, sy: 0 }; // -1..1, smoothed
        const phases = map.map((_, i) => i * 2.399); // golden angle: no two points drift in sync

        const resize = () => {
            width = space.clientWidth;
            height = space.clientHeight;
            svgRef.current?.setAttribute("viewBox", `0 0 ${width} ${height}`);
        };
        const update = (now: number) => {
            pointer.sx += (pointer.x - pointer.sx) * 0.06;
            pointer.sy += (pointer.y - pointer.sy) * 0.06;
            const positions = map.map((p, i) => {
                const depth = 0.4 + p.z;            // near points move more
                const drift = still ? 0 : 1;
                const x = p.x * width + Math.sin(now / 2600 + phases[i]) * 7 * depth * drift + pointer.sx * 26 * depth;
                const y = p.y * height + Math.cos(now / 3100 + phases[i] * 1.3) * 6 * depth * drift + pointer.sy * 18 * depth;
                pointRefs.current[i]?.style.setProperty("translate", `${x}px ${y}px`);
                return { x, y };
            });
            links.forEach(([i, j], k) => {
                const line = lineRefs.current[k];
                if (!line) return;
                line.setAttribute("x1", String(positions[i].x));
                line.setAttribute("y1", String(positions[i].y));
                line.setAttribute("x2", String(positions[j].x));
                line.setAttribute("y2", String(positions[j].y));
            });
            space.style.setProperty("--tilt-x", `${-pointer.sy * 5}deg`);
            space.style.setProperty("--tilt-y", `${pointer.sx * 7}deg`);
        };
        const frame = (now: number) => { update(now); raf = requestAnimationFrame(frame); };
        const onMove = (e: PointerEvent) => {
            const r = space.getBoundingClientRect();
            pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
            pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
        };
        const onLeave = () => { pointer.x = 0; pointer.y = 0; };

        const observer = new ResizeObserver(resize);
        observer.observe(space);
        resize();
        update(performance.now()); // place the points right away, before the first animation frame
        raf = requestAnimationFrame(frame);
        space.addEventListener("pointermove", onMove);
        space.addEventListener("pointerleave", onLeave);
        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
            space.removeEventListener("pointermove", onMove);
            space.removeEventListener("pointerleave", onLeave);
        };
    }, []);

    const focus = (i: number | null) => {
        setHover(i);
        if (i !== null) onFocus(i);
    };
    const linked = hover === null ? [] : map[hover].neighbors;

    return (
        <div className="projectMap">
            <div className="space" ref={spaceRef}>
                <div className="stars" aria-hidden="true" />
                <svg className="links" ref={svgRef} aria-hidden="true">
                    {links.map(([i, j], k) => (
                        <line key={k} ref={(el) => { lineRefs.current[k] = el; }}
                              className={hover === i || hover === j ? "active" : undefined} />
                    ))}
                </svg>
                {projects.map((project, i) => (
                    <button key={i} ref={(el) => { pointRefs.current[i] = el; }} data-map-point={i}
                            className={"mapPoint" + (hover === i ? " hover" : "") + (linked.includes(i) ? " linked" : "")
                                + (hover !== null && hover !== i && !linked.includes(i) ? " dim" : "")}
                            style={{
                                zIndex: Math.round(map[i].z * 10),
                                ...({ "--depth": map[i].z } as React.CSSProperties),
                            }}
                            onMouseEnter={() => focus(i)} onMouseLeave={() => focus(null)}
                            onFocus={() => focus(i)} onBlur={() => focus(null)}
                            onClick={() => onOpen(i)}>
                        <span className="thumb" style={{ backgroundImage: `url(${thumbnail(project.image)})` }} />
                        <span className="label">{project.name}</span>
                    </button>
                ))}
            </div>
            <p className="mapNote">{ui.mapNote}</p>
        </div>
    );
}
