import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { IoArrowBack, IoArrowForward, IoLink, IoLogoGithub, IoShuffle } from "react-icons/io5";
import { isBrowser, prefersReducedMotion } from "../../env";
import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import { getProjects, ProjectData } from "../../store/projects";
import { Modal } from "../modal";
import { ProjectMap } from "./ProjectMap";
import "./style.scss";

const pad = (n: number) => String(n).padStart(2, "0");
const canMorph = isBrowser && "startViewTransition" in document && !prefersReducedMotion();
const vt = (name: string, on: boolean) => (on ? { viewTransitionName: name } as CSSProperties : undefined);

function ProjectLinks({ project, focusable = true }: { project: ProjectData, focusable?: boolean }) {
    const ui = useUi().projects;
    const tabIndex = focusable ? undefined : -1;
    return (
        <>
            {project.github && (
                <a className="iconButton" href={project.github} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}
                   aria-label={ui.onGithub(project.name)} onClick={(e) => e.stopPropagation()}><IoLogoGithub /></a>
            )}
            {project.link && (
                <a className="iconButton" href={project.link} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}
                   aria-label={ui.open(project.name)} onClick={(e) => e.stopPropagation()}><IoLink /></a>
            )}
        </>
    );
}

export function Projects() {
    const ui = useUi().projects;
    const { route, navigate } = useRoute();
    const projects = getProjects(route.lang);
    const trackRef = useRef<HTMLDivElement>(null);
    // The URL decides which project is open: /projects/<slug>/
    const routed = projects.findIndex((p) => p.slug === route.project);
    const open = routed >= 0 ? routed : null;
    const [active, setActive] = useState(Math.max(0, routed));
    // Carousel or similarity map; remembered per visitor (read after mount, the pre-rendered page shows the carousel).
    const [view, setView] = useState<"carousel" | "map">("carousel");
    useEffect(() => {
        try { if (localStorage.getItem("projectView") === "map") setView("map"); } catch { /* storage unavailable */ }
    }, []);
    const chooseView = (next: "carousel" | "map") => {
        setView(next);
        try { localStorage.setItem("projectView", next); } catch { /* storage unavailable */ }
    };
    const setOpen = (i: number | null) =>
        navigate({ ...route, project: i === null ? null : projects[i].slug }, { replace: i === null });
    // The card currently carrying the shared-element names (only during a transition).
    const [morphing, setMorphing] = useState<number | null>(null);
    // Images load lazily: nothing until the section comes near the viewport, then the active
    // project and its neighbours, and every project that has been passed since.
    const sectionRef = useRef<HTMLElement>(null);
    const [near, setNear] = useState(false);
    const [seen, setSeen] = useState<Set<number>>(() => new Set());

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            setNear(true);
            observer.disconnect();
        }, { rootMargin: "100% 0px" });
        observer.observe(sectionRef.current!);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!near) return;
        const wanted = [active - 1, active, active + 1].filter((i) => i >= 0 && i < projects.length);
        setSeen((s) => wanted.every((i) => s.has(i)) ? s : new Set([...s, ...wanted]));
    }, [near, active, projects.length]);
    const image = (i: number) => (seen.has(i) ? `url(${projects[i].image})` : undefined);

    const scrollTo = useCallback((i: number, smooth = true) => {
        const track = trackRef.current!;
        const card = track.children[i] as HTMLElement;
        track.scrollTo({
            left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2,
            behavior: smooth ? "smooth" : "auto",
        });
    }, []);

    // The project closest to the middle of the track is the active one.
    useEffect(() => {
        const track = trackRef.current!;
        let raf = 0;
        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const center = track.scrollLeft + track.clientWidth / 2;
                let best = 0, bestDistance = Infinity;
                Array.from(track.children).forEach((child, i) => {
                    const el = child as HTMLElement;
                    const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
                    if (distance < bestDistance) { best = i; bestDistance = distance; }
                });
                setActive(best);
            });
        };
        track.addEventListener("scroll", onScroll, { passive: true });
        return () => { track.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
    }, []);

    // Back from the map, the carousel centres the project that was selected there.
    const activeRef = useRef(active);
    activeRef.current = active;
    useEffect(() => {
        if (view === "carousel") scrollTo(activeRef.current, false);
    }, [view, scrollTo]);

    // A project opened by URL starts centred in the carousel.
    useEffect(() => { if (routed >= 0) scrollTo(routed, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const go = (i: number) => scrollTo((i + projects.length) % projects.length);
    const shuffle = () => {
        let next = active;
        while (next === active && projects.length > 1) next = Math.floor(Math.random() * projects.length);
        go(next);
    };

    // From the map: the white dialog grows out of the clicked node. It starts as that circle (same position
    // and size), grows into the article card while the content fades in, and shrinks back into the node
    // (wherever it floats by then) when closed. Plain Web Animations, so it works in every browser.
    const morphFromNode = (i: number, direction: "open" | "close") => {
        const dialog = document.querySelector<HTMLDialogElement>("dialog.modal.pullable");
        const thumb = document.querySelector<HTMLElement>(`[data-map-point="${i}"] .thumb`);
        const content = dialog?.querySelector<HTMLElement>(".modalInner");
        if (!dialog || !thumb || !content || prefersReducedMotion()) return null;
        const d = dialog.getBoundingClientRect(), t = thumb.getBoundingClientRect();
        const dx = t.left + t.width / 2 - (d.left + d.width / 2), dy = t.top + t.height / 2 - (d.top + d.height / 2);
        const node = { transform: `translate(${dx}px, ${dy}px) scale(${t.width / d.width}, ${t.height / d.height})`, borderRadius: "50%" };
        const card = { transform: "none", borderRadius: getComputedStyle(dialog).borderRadius };
        const opening = direction === "open";
        // Leftovers of an earlier close (kept at their end state) would hide the content again.
        if (opening) dialog.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        const timing = {
            duration: opening ? 450 : 340,
            easing: opening ? "cubic-bezier(0.2, 0.8, 0.2, 1)" : "cubic-bezier(0.55, 0, 0.75, 0.2)",
            fill: opening ? "none" : "forwards",
        } as const;
        // Opening: the node *becomes* the article, so it's hidden. Closing: it's back underneath, and the
        // shrinking circle fades out onto it at the end instead of swapping hard.
        thumb.style.visibility = opening ? "hidden" : "";
        const shape = dialog.animate(opening
            ? [node, card]
            : [{ ...card, opacity: 1 }, { opacity: 1, offset: 0.7 }, { ...node, opacity: 0 }], timing);
        content.animate(opening
            ? [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }]
            : [{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], timing);
        try { dialog.animate(opening ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { ...timing, pseudoElement: "::backdrop" }); } catch { /* older browsers */ }
        return shape;
    };

    // However the article was closed (back button, view switch …), its node shows up again.
    useEffect(() => {
        if (open === null) document.querySelectorAll<HTMLElement>(".mapPoint .thumb").forEach((t) => { t.style.visibility = ""; });
    }, [open]);

    // Card and detail view share element names, so the card morphs into the dialog and back.
    const openProject = (i: number) => {
        if (view === "map") {
            flushSync(() => setOpen(i));
            morphFromNode(i, "open");
            return;
        }
        if (!canMorph) return setOpen(i);
        flushSync(() => setMorphing(i));
        document.startViewTransition(() => flushSync(() => { setMorphing(null); setOpen(i); }));
    };
    const closeProject = () => {
        if (open === null) return;
        if (view === "map") {
            const animation = morphFromNode(open, "close");
            if (!animation) return setOpen(null);
            // Close when the animation ends, or after its duration at the latest (e.g. in a background tab).
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                // Close first (synchronously), then drop the animations; the other way round the full
                // dialog would flash up for a frame.
                flushSync(() => setOpen(null));
                document.querySelector("dialog.modal.pullable")?.getAnimations({ subtree: true }).forEach((a) => a.cancel());
                document.querySelectorAll<HTMLElement>(".mapPoint .thumb").forEach((t) => { t.style.visibility = ""; });
            };
            animation.finished.then(finish, finish);
            window.setTimeout(finish, 450);
            return;
        }
        if (!canMorph) return setOpen(null);
        const i = open;
        document.startViewTransition(() => flushSync(() => { setOpen(null); setMorphing(i); }))
            .finished.finally(() => setMorphing(null));
    };

    // Other parts of the page (e.g. the search hero) can ask to open a project.
    const openRef = useRef(openProject);
    openRef.current = openProject;
    useEffect(() => {
        const onOpen = (e: Event) => {
            const i = (e as CustomEvent<number>).detail;
            document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" });
            scrollTo(i, false);
            window.setTimeout(() => openRef.current(i), 700);
        };
        window.addEventListener("project:open", onOpen);
        return () => window.removeEventListener("project:open", onOpen);
    }, [scrollTo]);

    const current = open !== null ? projects[open] : null;

    return (
        <section className="projects" id="projects" ref={sectionRef}>
            <div className="projectsBg" aria-hidden="true">
                {projects.map((_, i) => seen.has(i) && (
                    <div key={i} className={"bgLayer" + (i === active ? " active" : "")}
                         style={{ backgroundImage: image(i) }} />
                ))}
            </div>

            <div className="projectsHead container">
                <p className="eyebrow">{ui.eyebrow}</p>
                <h2 className="display sectionTitle"><em>{ui.title}</em></h2>
            </div>

            <div className="viewSwitch" role="group" aria-label={ui.view}>
                <button aria-pressed={view === "carousel"} onClick={() => chooseView("carousel")}>{ui.carousel}</button>
                <button aria-pressed={view === "map"} onClick={() => chooseView("map")}>{ui.map}</button>
            </div>

            {view === "map" && <ProjectMap projects={projects} onOpen={openProject} onFocus={setActive} />}

            <div className="track" ref={trackRef} tabIndex={0} aria-label={ui.region} role="region" hidden={view === "map"}>
                {projects.map((p, i) => (
                    <article key={i} className={"projectCard" + (i === active ? " active" : "")}
                             style={vt("project-card", morphing === i)}
                             onClick={() => (i === active ? openProject(i) : go(i))}>
                        <div className="cardImage"
                             style={{ backgroundImage: image(i), ...vt("project-image", morphing === i) }} />
                        <div className="cardBody">
                            <p className="eyebrow">{p.date}</p>
                            <h3 className="serif">
                                <a href={`${route.lang === "de" ? "/de" : ""}/projects/${p.slug}/`} tabIndex={-1}
                                   onClick={(e) => e.preventDefault()}>{p.name}</a>
                            </h3>
                            {p.technologies.length > 0 && <p className="tech">{p.technologies.join(" · ")}</p>}
                            <div className="cardActions" aria-hidden={i !== active}>
                                <button className="readMore" tabIndex={i === active ? 0 : -1}
                                        onClick={(e) => { e.stopPropagation(); openProject(i); }}>
                                    {ui.readMore}
                                </button>
                                <ProjectLinks project={p} focusable={i === active} />
                            </div>
                        </div>
                    </article>
                ))}
            </div>

            <div className="projectControls" hidden={view === "map"}>
                <button className="iconButton" onClick={() => go(active - 1)} aria-label={ui.previous}><IoArrowBack /></button>
                <span className="counter" aria-live="polite">
                    {pad(active + 1)} <span>/ {pad(projects.length)}</span>
                </span>
                <button className="iconButton" onClick={() => go(active + 1)} aria-label={ui.next}><IoArrowForward /></button>
                <button className="iconButton" onClick={shuffle} aria-label={ui.random}><IoShuffle /></button>
            </div>

            <Modal open={current !== null} onClose={closeProject} label={current?.name ?? "Project"}
                   transitionName={canMorph ? "project-card" : undefined} pullToClose>
                {current && (
                    <article className="projectDetail">
                        <p className="eyebrow">{current.date}</p>
                        <h3 className="display serif">{current.name}</h3>
                        {current.technologies.length > 0 && <p className="tech">{current.technologies.join(" · ")}</p>}
                        <img src={current.image} alt="" style={vt("project-image", canMorph)} />
                        <p className="lead">{current.description}</p>
                        {current.text.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
                        {(current.github || current.link) && (
                            <div className="detailLinks"><ProjectLinks project={current} /></div>
                        )}
                    </article>
                )}
            </Modal>
        </section>
    );
}
