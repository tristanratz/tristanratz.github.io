import { useEffect, useRef } from "react";
import { useReveal } from "../../hooks/useReveal";
import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import { experienceId, getPerson, Person } from "../../store/person";
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

    let index = 0;
    return (
        <section className="section experience" id="experience">
            <div className="container">
                <p className="eyebrow">{ui.eyebrow}</p>
                <h2 className="display">{ui.title}</h2>
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
