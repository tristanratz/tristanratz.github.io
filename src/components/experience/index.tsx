import { useEffect, useRef, useState } from "react";
import { IoBoatOutline, IoTrophyOutline } from "react-icons/io5";
import { useReveal } from "../../hooks/useReveal";
import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import { experienceId, getPerson, Person } from "../../store/person";
import { prefersReducedMotion } from "../../env";
import { Regatta, REGATTA_FADE } from "./Regatta";
import { BOAT_COLORS, peakBeaufort, WIND_SCALE } from "./regattaPhysics";

type RegattaView = "both" | "timeline" | "regatta";

/** A boat from above in its colour, for the scoreboard: the colours on the water are the boats. */
const BoatIcon = ({ color }: { color: string }) => (
    <svg className="boatIcon" viewBox="-16 -9 36 18" aria-hidden="true">
        <path d="M18 0C15 -4.2 8 -6.8 -2 -7.2L-14.5 -6.4Q-15.4 0 -14.5 6.4L-2 7.2C8 6.8 15 4.2 18 0Z" fill={color} />
        <path d="M18 0C15 -4.2 8 -6.8 -2 -7.2L-14.5 -6.4Q-15.4 0 -14.5 6.4L-2 7.2C8 6.8 15 4.2 18 0Z" fill="#fff" transform="scale(0.8 0.62)" />
        <path d="M5 0Q-3 4.5 -13 5L5 0Z" fill={color} fillOpacity={0.35} stroke={color} strokeWidth={0.8} />
    </svg>
);
const VIEWS: RegattaView[] = ["both", "timeline", "regatta"];
import "./style.scss";

type Step = Person["path"][number];

// Consecutive steps from the same year share one year marker.
const groupByYear = (path: Step[]) => path.reduce<{ when: string, steps: Step[] }[]>((groups, step) => {
    const last = groups[groups.length - 1];
    if (last?.when === step.when) last.steps.push(step);
    else groups.push({ when: step.when, steps: [step] });
    return groups;
}, []);

function Entry({ step, index, side, current }: { step: Step, index: number, side: "left" | "right", current: boolean }) {
    const ref = useReveal<HTMLLIElement>();
    return (
        <li ref={ref} id={experienceId(index)} className={`entry ${side} reveal` + (current ? " current" : "")}>
            <a href={step.url} target="_blank" rel="noopener noreferrer">
                {/* Time spent there, revealed on the other side of the line on hover. */}
                <span className={"period" + (step.period ? "" : " implicit")}>{step.period ?? step.when}</span>
                <h3>{step.title}</h3>
                <p className="where">{step.where} <span aria-hidden="true">↗</span></p>
                {step.note && <p className="note">{step.note}</p>}
            </a>
        </li>
    );
}

export function Experience() {
    const timelineRef = useRef<HTMLOListElement>(null);
    const ui = useUi().experience;
    const years = groupByYear(getPerson(useRoute().route.lang).path);

    // The line fills up as the timeline scrolls past the middle of the screen.
    useEffect(() => {
        const timeline = timelineRef.current!;
        let raf = 0;
        const update = () => {
            const rect = timeline.getBoundingClientRect();
            const progress = Math.min(1, Math.max(0, (window.innerHeight * 0.6 - rect.top) / rect.height));
            timeline.style.setProperty("--progress", `${progress * 100}%`);
        };
        const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, []);

    const sectionRef = useRef<HTMLElement>(null);
    // What the section shows: timeline and regatta together, only the timeline, or only the regatta
    // (the timeline steps aside so the whole sea is free). Remembered per visitor; read after mount,
    // the pre-rendered page shows both.
    const [view, setView] = useState<RegattaView>("both");
    const [boats, setBoats] = useState(true); // the regatta is mounted
    const [scores, setScores] = useState<number[]>([0, 0, 0, 0, 0]);
    // How hard the pointer blows; remembered per visitor.
    const [wind, setWind] = useState(1);
    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem("regattaWind"));
            if (saved >= WIND_SCALE.min && saved <= WIND_SCALE.max) setWind(saved);
            const stored = localStorage.getItem("regattaView") ?? (localStorage.getItem("sailboats") === "off" ? "timeline" : null);
            if (stored === "timeline" || stored === "regatta") {
                setView(stored);
                if (stored === "timeline") setBoats(false);
            }
        } catch { /* storage unavailable */ }
    }, []);
    const changeWind = (value: number) => {
        setWind(value);
        try { localStorage.setItem("regattaWind", String(value)); } catch { /* storage unavailable */ }
    };
    // Leaving the regatta fades it out first and only then takes it away; coming back in the
    // meantime keeps it.
    const [leaving, setLeaving] = useState(false);
    const fadeTimer = useRef(0);
    const choose = (next: RegattaView) => {
        setView(next);
        try { localStorage.setItem("regattaView", next); } catch { /* storage unavailable */ }
        window.clearTimeout(fadeTimer.current);
        if (next !== "timeline") {
            setLeaving(false);
            setBoats(true);
        } else if (boats) {
            if (prefersReducedMotion()) return setBoats(false);
            setLeaving(true);
            fadeTimer.current = window.setTimeout(() => { setBoats(false); setLeaving(false); }, REGATTA_FADE);
        }
    };
    const on = view !== "timeline";
    let index = 0;
    return (
        <section className={"section experience" + (view === "regatta" ? " regattaOnly" : "")} id="experience" ref={sectionRef}>
            {boats && <Regatta section={sectionRef} onScore={setScores} leaving={leaving} wind={wind} focus={view === "regatta"} />}
            {/* Sticky: switch and board stay in view while scrolling through the section. */}
            <div className="regattaPanel">
                <div className="regattaViews" role="group" aria-label={ui.regatta.show} title={ui.regatta.hint}>
                    {VIEWS.map((v) => (
                        <button key={v} aria-pressed={view === v} onClick={() => choose(v)}>
                            {v === "regatta" && <IoBoatOutline />}{ui.regatta.views[v]}
                        </button>
                    ))}
                </div>
                {/* Scoreboard and wind only with the regatta alone; it slides in and out. */}
                {on && (
                    <div className={"regattaBoard" + (view === "regatta" ? " shown" : "")} aria-hidden={view !== "regatta"}>
                        <p className="scoreTitle"><IoTrophyOutline /> {ui.regatta.scoreTitle}</p>
                        <ol className="scores" aria-label={ui.regatta.scores}>
                            {scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score || a.i - b.i).map(({ score, i }) => (
                                <li key={i} title={ui.regatta.boat(ui.regatta.colors[i], score)}>
                                    <BoatIcon color={BOAT_COLORS[i]} />
                                    <span className="name">{ui.regatta.colors[i]}</span>
                                    <span className="score">{score}</span>
                                </li>
                            ))}
                        </ol>
                        <label className="windControl" title={ui.regatta.windHint}>
                            <span>{ui.regatta.wind}</span>
                            <input type="range" min={WIND_SCALE.min} max={WIND_SCALE.max} step={0.05} value={wind}
                                   onChange={(e) => changeWind(Number(e.target.value))} aria-valuetext={`${peakBeaufort(wind)} Bft`} />
                            <output>{peakBeaufort(wind)} Bft</output>
                        </label>
                    </div>
                )}
            </div>
            <div className="container">
                <p className="eyebrow">{ui.eyebrow}</p>
                <h2 className="display sectionTitle">{ui.title[0]}<em>{ui.title[1]}</em></h2>
                <ol className="timeline" ref={timelineRef}>
                    {years.map((year) => (
                        <li key={year.when} className="year">
                            <span className="yearLabel">{year.when}</span>
                            <ol>
                                {year.steps.map((step) => {
                                    const i = index++;
                                    return <Entry key={step.title} step={step} index={i} side={i % 2 ? "left" : "right"} current={i === 0} />;
                                })}
                            </ol>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
