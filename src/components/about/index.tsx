import { CSSProperties, PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
    IoArrowForward, IoBriefcaseOutline, IoChatbubblesOutline, IoDesktopOutline, IoHeartOutline, IoLocationOutline, IoStarOutline,
} from "react-icons/io5";
import { useReveal } from "../../hooks/useReveal";
import portrait from "../../rsc/tristan.jpg";
import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import { getPerson } from "../../store/person";
import { isBrowser, prefersReducedMotion } from "../../env";
import { Icons } from "../Icons";
import { Modal } from "../modal";
import { Constellation } from "./Constellation";
import "./style.scss";

/** Hover: the card leans towards the pointer and lights up under it (see .floating in style.scss). */
const tilt = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--tilt-x", `${(0.5 - y) * 10}deg`);
    el.style.setProperty("--tilt-y", `${(x - 0.5) * 12}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.setProperty("--px", (x - 0.5).toFixed(3)); // for the icon's shadow
    el.style.setProperty("--py", (y - 0.5).toFixed(3));
};
const untilt = (e: PointerEvent<HTMLElement>) => {
    ["--tilt-x", "--tilt-y"].forEach((p) => e.currentTarget.style.removeProperty(p));
};

interface CardProps { id: string, icon: ReactNode, label: string, index: number, children: ReactNode }

/**
 * `id` stays the same in every language: the search jumps to it (e.g. "about-languages"). Like the points
 * of the project map, a card leans towards the pointer and lights up under it (`tilt`).
 */
function InfoCard({ id, icon, label, index, children }: CardProps) {
    const ref = useReveal<HTMLDivElement>();
    return (
        <div ref={ref} id={"about-" + id} className="infoCard floating reveal"
             style={{ transitionDelay: `${index * 70}ms` }} onPointerMove={tilt} onPointerLeave={untilt}
             // The stagger is for fading in only; afterwards hover, lift and shadow react right away.
             onTransitionEnd={(e) => { if (e.propertyName === "opacity") e.currentTarget.style.transitionDelay = ""; }}>
            {icon}
            <h3>{label}</h3>
            {children}
        </div>
    );
}

const vt = (name: string, on: boolean) => (on ? { viewTransitionName: name } as CSSProperties : undefined);

/** Renders the **…** parts of a paragraph highlighted. */
const highlight = (text: string) =>
    text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

const canMorph = isBrowser && "startViewTransition" in document && !prefersReducedMotion();

export function About() {
    const ref = useReveal<HTMLElement>();
    const ui = useUi().about;
    const person = getPerson(useRoute().route.lang);
    const areaRef = useRef<HTMLDivElement>(null);
    // The whole text in a dialog; the card morphs into it and back, like a project card.
    const [open, setOpen] = useState(false);
    const [morphing, setMorphing] = useState(false);
    // The circle rounds into the dialog's corners on the way (data-profile-morph, see style.scss).
    const show = (next: boolean) => {
        if (!canMorph) return setOpen(next);
        const root = document.documentElement;
        root.dataset.profileMorph = next ? "open" : "close";
        const transition = next
            ? (flushSync(() => setMorphing(true)), document.startViewTransition(() => flushSync(() => { setMorphing(false); setOpen(true); })))
            : document.startViewTransition(() => flushSync(() => { setOpen(false); setMorphing(true); }));
        transition.finished.finally(() => {
            delete root.dataset.profileMorph;
            if (!next) setMorphing(false);
        });
    };
    // The site search leads here for things in the text: it opens.
    const showRef = useRef(show);
    showRef.current = show;
    useEffect(() => {
        const card = ref.current!, reveal = () => window.setTimeout(() => showRef.current(true), 600);
        card.addEventListener("search:reveal", reveal);
        return () => card.removeEventListener("search:reveal", reveal);
    }, [ref]);

    const name = `${person.firstName} ${person.lastName}`;
    return (
        <section className="section about" id="about">
            <div className="container aboutGrid" ref={areaRef}>
                <Constellation area={areaRef} />
                {/* A circle: the portrait sticks out at the top, the links sit around its lower edge. Only the
                    first paragraph shows; the rest is in the page all along (for search engines and screen
                    readers), the dialog shows it all. */}
                <article className="profileCard floating reveal" data-morphing={morphing || undefined} id="profile" ref={ref} style={vt("profile-card", morphing)}
                         onPointerMove={tilt} onPointerLeave={untilt}
                         // The whole circle opens the dialog (the links keep their own clicks; for the
                         // keyboard there's the button).
                         onClick={(e) => { if (!(e.target as Element).closest("a, button")) show(true); }}>
                    <img className="portrait" src={portrait} alt={ui.portrait(name)} width={120} height={120} loading="lazy"
                         style={vt("profile-portrait", morphing)} />
                    <h2>{name}</h2>
                    <p className="job">{person.job}</p>
                    <div className="profileText">
                        <p>{highlight(person.about[0])}</p>
                        <div className="visuallyHidden">{person.about.slice(1).map((paragraph, i) => <p key={i}>{highlight(paragraph)}</p>)}</div>
                    </div>
                    <button className="profileMore" onClick={() => show(true)} aria-haspopup="dialog">
                        {ui.readMore} <IoArrowForward aria-hidden="true" />
                    </button>
                    <Icons />
                </article>

                <InfoCard id="based-in" index={0} icon={<IoLocationOutline />} label={ui.basedIn}>
                    <p><strong>{person.city}</strong>{person.locationHint && ` ${person.locationHint}`},<br />{person.state}, {person.country}</p>
                </InfoCard>
                <InfoCard id="working-at" index={1} icon={<IoBriefcaseOutline />} label={ui.workingAt}>
                    <p><strong>{person.employer}</strong> {ui.as}<br />{person.job}</p>
                </InfoCard>
                <InfoCard id="languages" index={2} icon={<IoChatbubblesOutline />} label={ui.languages}>
                    <p>{person.languages.map((l, i) => <span key={l.name}>{i > 0 && <br />}{l.name} ({l.level})</span>)}</p>
                </InfoCard>
                <InfoCard id="qualities" index={3} icon={<IoStarOutline />} label={ui.qualities}>
                    <p>{person.qualities.map((q, i) => <span key={q}>{i > 0 && <br />}{i === 0 ? <strong>{q}</strong> : q}</span>)}</p>
                </InfoCard>
                <InfoCard id="technologies" index={4} icon={<IoDesktopOutline />} label={ui.technologies}>
                    <p>{person.favTec.join(", ")}</p>
                </InfoCard>
                <InfoCard id="interests" index={5} icon={<IoHeartOutline />} label={ui.interests}>
                    <p>{person.interests.map((t, i) => <span key={t}>{i > 0 && <br />}{t}</span>)}</p>
                </InfoCard>
            </div>

            <Modal open={open} onClose={() => show(false)} label={name} transitionName={canMorph ? "profile-card" : undefined} pullToClose>
                <article className="profileDetail">
                    <header>
                        <img className="portrait" src={portrait} alt="" width={120} height={120} style={vt("profile-portrait", canMorph)} />
                        <div>
                            <h3>{name}</h3>
                            <p className="job">{person.job}</p>
                            <Icons />
                        </div>
                    </header>
                    {person.about.map((paragraph, i) => <p key={i}>{highlight(paragraph)}</p>)}
                </article>
            </Modal>
        </section>
    );
}
