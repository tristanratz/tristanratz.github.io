import { useEffect, useRef, useState } from "react";
import { IoBoatOutline } from "react-icons/io5";
import { useReveal } from "../../hooks/useReveal";
import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import { experienceId, getPerson, Person } from "../../store/person";
import { prefersReducedMotion } from "../../env";
import { Regatta, REGATTA_FADE } from "./Regatta";
import { BOAT_COLORS } from "./regattaPhysics";
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
    // The sailboats can be switched off; remembered per visitor (read after mount, the pre-rendered page has them on).
    const [boats, setBoats] = useState(true);
    const [scores, setScores] = useState<number[]>([0, 0, 0, 0, 0]);
    useEffect(() => {
        try { if (localStorage.getItem("sailboats") === "off") setBoats(false); } catch { /* storage unavailable */ }
    }, []);
    // Switching off fades the regatta out first and only then takes it away; clicking again while
    // it fades brings it back.
    const [leaving, setLeaving] = useState(false);
    const fadeTimer = useRef(0);
    const remember = (on: boolean) => {
        try { localStorage.setItem("sailboats", on ? "on" : "off"); } catch { /* storage unavailable */ }
    };
    const toggleBoats = () => {
        window.clearTimeout(fadeTimer.current);
        if (leaving) {
            setLeaving(false);
            remember(true);
        } else if (boats) {
            remember(false);
            if (prefersReducedMotion()) return setBoats(false);
            setLeaving(true);
            fadeTimer.current = window.setTimeout(() => { setBoats(false); setLeaving(false); }, REGATTA_FADE);
        } else {
            setBoats(true);
            remember(true);
        }
    };
    const on = boats && !leaving;
    let index = 0;
    return (
        <section className="section experience" id="experience" ref={sectionRef}>
            {boats && <Regatta section={sectionRef} onScore={setScores} leaving={leaving} />}
            <div className={"regattaPanel" + (on ? "" : " off")}>
                <button onClick={toggleBoats} aria-pressed={on} title={ui.regatta.hint}>
                    <IoBoatOutline /> {on ? ui.regatta.disable : ui.regatta.enable}
                </button>
                {on && (
                    <ol className="scores" aria-label={ui.regatta.scores}>
                        {scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score || a.i - b.i).map(({ score, i }) => (
                            <li key={i} title={ui.regatta.boat(ui.regatta.colors[i], score)}>
                                <span className="dot" style={{ background: BOAT_COLORS[i] }} />{score}
                            </li>
                        ))}
                    </ol>
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
