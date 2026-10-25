import { CSSProperties, Fragment, MutableRefObject, useEffect, useRef, useState } from "react";
import { IoArrowDown } from "react-icons/io5";
import { prefersReducedMotion, useIsomorphicLayoutEffect } from "../../env";
import { useUi } from "../../i18n";
import { Lang, useRoute } from "../../router";
import { getPerson } from "../../store/person";
import { Icons } from "../Icons";
import { NetworkHandle, NeuralNetwork } from "./NeuralNetwork";
import { SearchBox } from "./SearchBox";
import "./style.scss";

// The slogan is "generated" token by token, each token produced by one forward pass.
// (Same wording as `slogan` in person.tsx, which the page description uses.)
interface Token { text: string, lineBreak?: boolean, accent?: boolean }
const sloganTokens: Record<Lang, Token[]> = {
    en: [
        { text: "AI" },
        { text: " integration" },
        { text: " should" },
        { text: " only" },
        { text: " be", lineBreak: true },
        { text: " a" },
        { text: " means" },
        { text: " to" },
        { text: " better", accent: true },
        { text: " UX", accent: true },
    ],
    de: [
        { text: "KI" },
        { text: "-Integration" },
        { text: " sollte" },
        { text: " nur" },
        { text: " ein", lineBreak: true },
        { text: " Mittel" },
        { text: " zu" },
        { text: " besserer", accent: true },
        { text: " UX", accent: true },
        { text: " sein" },
    ],
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// All tokens keep their final place (so centred lines never jump); only revealed ones are visible.
function Tokens({ tokens, count, refs }: { tokens: Token[], count: number, refs: MutableRefObject<(HTMLSpanElement | null)[]> }) {
    return (
        <>
            {tokens.map((t, i) => (
                <Fragment key={i}>
                    {t.lineBreak && <br />}
                    <span ref={(el) => { refs.current[i] = el; }}
                          className={"token" + (t.accent ? " accent" : "") + (i < count ? " shown" : "")}>{t.text}</span>
                </Fragment>
            ))}
        </>
    );
}

export function Intro() {
    const networkRef = useRef<NetworkHandle>(null);
    const dotRef = useRef<HTMLSpanElement>(null);
    const sliderRef = useRef<HTMLInputElement>(null);
    const sloganRef = useRef<HTMLParagraphElement>(null);
    const tokenRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const [dot, setDot] = useState<CSSProperties>({});
    const glideRef = useRef(0);
    const ui = useUi();
    const { lang } = useRoute().route;
    const person = getPerson(lang);
    const tokens = sloganTokens[lang], total = tokens.length;
    // Both start "empty" so the pre-rendered HTML matches the first render; generation starts after mount.
    const [count, setCount] = useState(0);
    const [playing, setPlaying] = useState(false);
    const countRef = useRef(count);
    countRef.current = count;

    const target = () => {
        const r = dotRef.current?.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };

    // The slider is driven imperatively so it can move continuously without re-rendering every frame.
    const setSlider = (value: number) => {
        const slider = sliderRef.current;
        if (!slider) return;
        slider.value = String(value);
        slider.style.setProperty("--progress", `${(value / total) * 100}%`);
    };
    const glide = (from: number, to: number, ms: number) => {
        cancelAnimationFrame(glideRef.current);
        const start = performance.now();
        const tick = (now: number) => {
            const k = Math.min(1, (now - start) / ms);
            setSlider(from + (to - from) * k);
            if (k < 1) glideRef.current = requestAnimationFrame(tick);
        };
        glideRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => {
        if (prefersReducedMotion()) { setCount(total); setSlider(total); } else setPlaying(true);
    }, []);

    // Plays the generation from the current position; the first tokens stream faster.
    useEffect(() => {
        if (!playing) return;
        let cancelled = false;
        (async () => {
            let i = countRef.current;
            if (i === 0) await sleep(250);
            for (; i < total && !cancelled; i++) {
                const speed = i < 3 ? 2.4 : 1.4;
                const from = Math.max(i, Number(sliderRef.current?.value ?? i));
                glide(from, i + 1, networkRef.current?.passDuration(speed) ?? 300);
                await networkRef.current?.forwardPass(target, speed);
                if (cancelled) return;
                setCount(i + 1);
                await sleep(i < 3 ? 15 : 30 + Math.random() * 70);
            }
            if (!cancelled) setPlaying(false);
        })();
        return () => { cancelled = true; cancelAnimationFrame(glideRef.current); };
    }, [playing]);

    // Dragging pauses playback; crossing a token forward fires a quick pass through the network.
    const startScrub = () => {
        cancelAnimationFrame(glideRef.current);
        setPlaying(false);
    };
    const scrub = (value: number) => {
        setSlider(value);
        const next = Math.floor(value + 1e-6);
        for (let i = countRef.current; i < next; i++) networkRef.current?.forwardPass(target, 3.5);
        setCount(next);
    };
    // Releasing the slider continues generating from where it was left.
    const endScrub = () => { if (countRef.current < total) setPlaying(true); };

    const done = count >= total;
    const generatedOnce = useRef(false);
    if (done) generatedOnce.current = true;

    // The dot follows the last revealed token; before the first one it waits at the start.
    useIsomorphicLayoutEffect(() => {
        const place = () => {
            const slogan = sloganRef.current;
            const anchor = tokenRefs.current[Math.max(0, count - 1)];
            if (!slogan || !anchor) return;
            const box = slogan.getBoundingClientRect();
            const rects = anchor.getClientRects();
            const r = count === 0 ? rects[0] : rects[rects.length - 1];
            setDot({
                left: (count === 0 ? r.left - box.left - r.height * 0.3 : r.right - box.left) + "px",
                top: r.top - box.top + r.height * 0.64 + "px",
            });
        };
        place();
        const observer = new ResizeObserver(place);
        observer.observe(sloganRef.current!);
        return () => observer.disconnect();
    }, [count]);

    return (
        <section className="intro" id="intro">
            <NeuralNetwork ref={networkRef} />
            <div className="heroContent">
                <figure className="quote">
                    <blockquote>
                        <p className="slogan" ref={sloganRef} aria-label={person.slogan}>
                            <span aria-hidden="true"><Tokens tokens={tokens} count={count} refs={tokenRefs} /></span>
                            <span ref={dotRef} className={"dot" + (done ? " done" : "")} style={dot} aria-hidden="true" />
                        </p>
                    </blockquote>

                    <input ref={sliderRef} className="scrubber" type="range" min={0} max={total} step="any"
                           defaultValue={0}
                           style={{ "--progress": "0%" } as CSSProperties}
                           title={ui.hero.scrubberTitle}
                           aria-label={ui.hero.scrubberLabel}
                           aria-valuetext={ui.hero.words(count, total)}
                           onPointerDown={() => {
                               startScrub();
                               window.addEventListener("pointerup", endScrub, { once: true });
                           }}
                           onKeyDown={startScrub}
                           onKeyUp={endScrub}
                           onChange={(e) => scrub(Number(e.target.value))} />

                    <figcaption>
                        <h1>{person.firstName} {person.lastName}</h1>
                        <p>{person.job}</p>
                    </figcaption>
                </figure>
                <SearchBox entry animate={done || generatedOnce.current} />
                <Icons />
            </div>
            <a href="#about" className="downArrow iconButton" aria-label={ui.hero.scrollDown}><IoArrowDown /></a>
        </section>
    );
}
