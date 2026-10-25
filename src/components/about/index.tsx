import { ReactNode } from "react";
import {
    IoBriefcaseOutline, IoChatbubblesOutline, IoDesktopOutline, IoHeartOutline, IoLocationOutline, IoStarOutline,
} from "react-icons/io5";
import { useReveal } from "../../hooks/useReveal";
import portrait from "../../rsc/tristan.jpg";
import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import { getPerson } from "../../store/person";
import { Icons } from "../Icons";
import "./style.scss";

interface CardProps { id: string, icon: ReactNode, label: string, index: number, children: ReactNode }

/** `id` stays the same in every language: the search jumps to it (e.g. "about-languages"). */
function InfoCard({ id, icon, label, index, children }: CardProps) {
    const ref = useReveal<HTMLDivElement>();
    return (
        <div ref={ref} id={"about-" + id} className="infoCard reveal" style={{ transitionDelay: `${index * 70}ms` }}>
            {icon}
            <h3>{label}</h3>
            {children}
        </div>
    );
}

/** Renders the **…** parts of a paragraph highlighted. */
const highlight = (text: string) =>
    text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

export function About() {
    const ref = useReveal<HTMLElement>();
    const ui = useUi().about;
    const person = getPerson(useRoute().route.lang);

    return (
        <section className="section about" id="about">
            <div className="container">
                <article className="profileCard reveal" id="profile" ref={ref}>
                    <header className="profileHead">
                        <img className="portrait" src={portrait} alt={ui.portrait(`${person.firstName} ${person.lastName}`)}
                             width={112} height={112} loading="lazy" />
                        <div>
                            <h2>{person.firstName} {person.lastName}</h2>
                            <p>{person.job}</p>
                            <Icons />
                        </div>
                    </header>

                    <div className="profileText">
                        {person.about.map((paragraph, i) => <p key={i}>{highlight(paragraph)}</p>)}
                    </div>

                </article>

                <div className="infoCards">
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
            </div>
        </section>
    );
}
