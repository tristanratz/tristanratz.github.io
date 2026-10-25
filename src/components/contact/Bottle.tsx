import { FormEvent, useEffect, useState } from "react";
import { prefersReducedMotion } from "../../env";
import { useUi } from "../../i18n";
import { useRoute } from "../../router";
import "./bottle.scss";

type Topic = "job" | "collab" | "talk" | "hi";
type Status = "work" | "evening" | "weekend" | "night";

/** Local time in Darmstadt and a guess what Tristan is up to. */
function useDarmstadtTime(lang: string): { time: string, status: Status } | null {
    const [now, setNow] = useState<Date | null>(null); // set after mount: the pre-rendered page can't know the time
    useEffect(() => {
        setNow(new Date());
        const timer = window.setInterval(() => setNow(new Date()), 30_000);
        return () => window.clearInterval(timer);
    }, []);
    if (!now) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour) % 24;
    const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
    const status: Status = hour < 7 || hour >= 23 ? "night" : weekend ? "weekend" : hour >= 8 && hour < 18 ? "work" : "evening";
    const time = new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", {
        timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit",
    }).format(now);
    return { time, status };
}

/**
 * Contact form as a message in a bottle: pick a topic, write a few lines, and the bottle drifts off
 * on the waves before the visitor's mail app opens with everything filled in. Nothing is sent or stored here.
 */
export function Bottle({ email }: { email: string }) {
    const ui = useUi().bottle;
    const { lang } = useRoute().route;
    const clock = useDarmstadtTime(lang);
    const [topic, setTopic] = useState<Topic>("hi");
    const [message, setMessage] = useState(ui.templates.hi);
    // Choosing a topic swaps in its opening lines, unless the visitor has already written something of their own.
    const choose = (next: Topic) => {
        if (!message.trim() || message === ui.templates[topic]) setMessage(ui.templates[next]);
        setTopic(next);
    };
    const untouched = !message.trim() || message === ui.templates[topic];
    const [state, setState] = useState<"idle" | "sailing" | "sent">("idle");

    const send = (e: FormEvent) => {
        e.preventDefault();
        const subject = ui.subject(ui.topics[topic]);
        const body = `${message.trim()}\n\n— tristanratz.com`;
        const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const open = () => { window.location.href = href; setState("sent"); };
        if (prefersReducedMotion()) return open();
        setState("sailing");
        window.setTimeout(open, 1400); // let the bottle drift off first
        window.setTimeout(() => setState("idle"), 6000);
    };

    return (
        <form className={"bottle " + state} onSubmit={send}>
            <div className="bottleHead">
                <h3>{ui.title}</h3>
                {clock && <p className={"clock " + clock.status}><span className="dot" />{ui.time(clock.time)} · {ui.status[clock.status]}</p>}
                <p className="bottleIntro">{ui.intro}</p>
            </div>

            <div className="topics" role="group" aria-label={ui.topicLabel}>
                {(Object.keys(ui.topics) as Topic[]).map((t) => (
                    <button key={t} type="button" aria-pressed={topic === t} onClick={() => choose(t)}>{ui.topics[t]}</button>
                ))}
            </div>

            <label className="message">
                <span className="visuallyHidden">{ui.message}</span>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={ui.placeholder}
                          rows={6} maxLength={2000} />
            </label>

            <div className="sea" aria-hidden="true">
                <svg className="waves back" viewBox="0 0 400 40" preserveAspectRatio="none">
                    <path d="M0 22 Q25 12 50 22 T100 22 T150 22 T200 22 T250 22 T300 22 T350 22 T400 22 V40 H0 Z" />
                </svg>
                <svg className="bottleShape" viewBox="0 0 60 28">
                    <path className="glass" d="M4 8 Q4 4 8 4 H38 Q42 4 44 8 L48 10 H54 Q56 10 56 12 V16 Q56 18 54 18 H48 L44 20 Q42 24 38 24 H8 Q4 24 4 20 Z" />
                    <rect className="cork" x="54" y="10.5" width="5" height="7" rx="1.5" />
                    <rect className="note" x="11" y="9" width="24" height="10" rx="2" />
                </svg>
                <svg className="waves front" viewBox="0 0 400 40" preserveAspectRatio="none">
                    <path d="M0 26 Q25 18 50 26 T100 26 T150 26 T200 26 T250 26 T300 26 T350 26 T400 26 V40 H0 Z" />
                </svg>
            </div>

            <div className="sendRow">
                <button type="submit" className="send" disabled={untouched || state === "sailing"}>{ui.send}</button>
                {state === "sent" && <p className="sent" role="status">{ui.sent}</p>}
            </div>
        </form>
    );
}
