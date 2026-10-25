import { useRef, useState } from "react";
import { useReveal } from "../../hooks/useReveal";
import { useUi } from "../../i18n";
import { routePath, useRoute } from "../../router";
import { getPerson } from "../../store/person";
import { Icons } from "../Icons";
import { Imprint } from "../imprint";
import { Bike } from "./Bike";
import { Bottle } from "./Bottle";
import "./style.scss";

export function Contact() {
    const ui = useUi();
    const { route } = useRoute();
    const person = getPerson(route.lang);
    const other = route.lang === "de" ? "en" : "de";
    const [showImprint, setShowImprint] = useState(false);
    const footerRef = useRef<HTMLElement>(null);
    const ref = useReveal<HTMLDivElement>();

    return (
        <footer className="section contact" id="contact" ref={footerRef}>
            <div className="container reveal" ref={ref}>
                <div className="contactGrid">
                <div className="contactDetails">
                <p className="eyebrow">{ui.contact.eyebrow}</p>
                <h2 className="display sectionTitle">{ui.contact.title[0]}<em>{ui.contact.title[1]}</em></h2>
                <a className="contactMail" href={"mailto:" + person.email}>{person.email}</a>
                <dl className="contactFacts">
                    {person.phone && (
                        <div>
                            <dt className="eyebrow">{ui.contact.telephone}</dt>
                            <dd>{person.phone}{person.phoneHours && <><br />{person.phoneHours}</>}</dd>
                        </div>
                    )}
                    <div>
                        <dt className="eyebrow">{ui.contact.area}</dt>
                        <dd>{person.city}, {person.country}</dd>
                    </div>
                </dl>
                <Icons />
                </div>
                <Bottle email={person.email} />
                </div>
                <div className="legal">
                    {/* Now and then a cyclist rides along this line; grab and throw it (Bike.tsx). */}
                    <Bike host={footerRef} />
                    <span>© {new Date().getFullYear()} {person.firstName} {person.lastName}</span>
                    <a href={routePath({ ...route, lang: other })} hrefLang={other} lang={other}>{ui.language.switchTo}</a>
                    <button onClick={() => setShowImprint(true)}>{ui.contact.imprint}</button>
                </div>
            </div>
            <Imprint open={showImprint} onClose={() => setShowImprint(false)} />
        </footer>
    );
}
