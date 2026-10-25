import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IoSearch } from "react-icons/io5";
import { prefersReducedMotion, useIsomorphicLayoutEffect } from "../../env";
import { useUi } from "../../i18n";
import { SearchBox } from "../intro/SearchBox";

/**
 * The search overlay below the top bar. Opened by its button, Cmd/Ctrl+K, "/", a ?q= link, or by
 * clicking the hero search, in which case it glides out of the hero's search field (and back into it on close).
 */
export function HeaderSearch() {
    const ui = useUi();
    const [open, setOpen] = useState(false);
    const [initial, setInitial] = useState("");
    const [session, setSession] = useState(0); // fresh search box per opening
    const from = useRef<DOMRect | null>(null);
    // Set after mount: the pre-rendered HTML can't know the visitor's platform.
    const [shortcut, setShortcut] = useState("Ctrl K");
    useEffect(() => setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"), []);
    const panelRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const backdropRef = useRef<HTMLDivElement>(null);
    // Bumped on every opening and closing, so a closing animation that finishes late
    // doesn't close a search that was opened again in the meantime.
    const generation = useRef(0);
    // The hero's search folded away while the overlay is open, so the rest of the hero closes up.
    const fold = useRef<Animation | null>(null);

    const show = (query = "", rect: DOMRect | null = null) => {
        generation.current++;
        setInitial(query);
        from.current = rect;
        setSession((s) => s + 1);
        setOpen(true);
    };
    const hide = () => {
        // The shared ?q= link belongs to the open search.
        const url = new URL(window.location.href);
        if (url.searchParams.has("q")) {
            url.searchParams.delete("q");
            window.history.replaceState(window.history.state, "", url);
        }
        const panel = panelRef.current;
        const reduced = prefersReducedMotion();
        // Unfold the hero's search; the panel glides into where the field will end up.
        const hero = heroSearch();
        const folded = fold.current;
        fold.current = null;
        folded?.cancel();
        // Measured unfolded, before the unfold animation starts at height 0.
        const field = hero?.querySelector(".searchBox")!.getBoundingClientRect();
        const unfold = hero && folded ? hero.animate(
            [{ height: "0px", marginTop: "0px" }, { height: `${hero.offsetHeight}px`, marginTop: getComputedStyle(hero).marginTop }],
            reduced ? { duration: 0 } : CLOSE) : null;
        if (!panel || reduced) return setOpen(false);
        const current = ++generation.current;
        // Back into the hero's search field while it's on screen, otherwise just fade away.
        const animations = field && hero && onScreen(hero) ? glide(panel, field, "out") : [panel.animate(
            [{ opacity: 1 }, { opacity: 0, transform: "translateY(-8px) scale(0.98)" }],
            { duration: 200, easing: "ease-in", fill: "forwards" })];
        if (unfold) animations.push(unfold);
        const backdrop = backdropRef.current;
        if (backdrop) {
            backdrop.style.pointerEvents = "none";
            animations.push(backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }));
        }
        Promise.all(animations.map((a) => a.finished)).catch(() => undefined).then(() => {
            if (generation.current === current) setOpen(false);
        });
    };

    useEffect(() => {
        const q = new URLSearchParams(window.location.search).get("q");
        if (q) show(q);
        const onKey = (e: KeyboardEvent) => {
            const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
            if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
                e.preventDefault();
                show();
            } else if (e.key === "Escape") {
                hide();
            }
        };
        const onOpen = (e: Event) => {
            const { query, from: rect } = (e as CustomEvent<{ query: string, from?: DOMRect }>).detail;
            show(query, rect ?? null);
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("search:open", onOpen);
        window.addEventListener("project:open", hide);
        window.addEventListener("search:navigate", hide);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("search:open", onOpen);
            window.removeEventListener("project:open", hide);
            window.removeEventListener("search:navigate", hide);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Hides the hero field while the overlay stands in for it (until the closing animation has ended).
    useIsomorphicLayoutEffect(() => {
        document.documentElement.toggleAttribute("data-search-open", open);
    }, [open]);

    // Glide from the hero's search field into place, while the backdrop and results fade in
    // and the hero closes up around the field that's now gone.
    useIsomorphicLayoutEffect(() => {
        const panel = panelRef.current;
        if (!open || !panel) return;
        const reduced = prefersReducedMotion();
        const hero = heroSearch();
        // Opened from elsewhere (top bar, shortcut, link) while the hero field is in view:
        // the overlay still comes out of the field, since the field is what disappears.
        const rect = from.current ?? (hero && !fold.current && onScreen(hero)
            ? hero.querySelector(".searchBox")!.getBoundingClientRect() : null);
        // Only on screen: folding a hero above the viewport would shift the page under the visitor.
        if (hero && !fold.current && onScreen(hero)) {
            hero.getAnimations().forEach((a) => a.cancel()); // an unfold still running
            fold.current = hero.animate(
                [{ height: `${hero.offsetHeight}px`, marginTop: getComputedStyle(hero).marginTop }, { height: "0px", marginTop: "0px" }],
                { ...(reduced ? { duration: 0 } : OPEN), fill: "forwards" });
        }
        if (reduced) return;
        from.current = null;
        if (rect) glide(panel, rect, "in");
        else panel.animate([{ opacity: 0, transform: "translateY(-8px) scale(0.98)" }, { opacity: 1, transform: "none" }],
            { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }, [open, session]);

    return (
        <>
            <button ref={buttonRef} className="searchButton" onClick={() => (open ? hide() : show())}
                    aria-expanded={open} aria-controls="headerSearch" aria-label={ui.search.button}>
                <IoSearch />
                <span className="label">{ui.search.button}</span>
                <kbd>{shortcut}</kbd>
            </button>
            {open && (
                <>
                    {createPortal(<div className="searchBackdrop" ref={backdropRef} onClick={hide} />, document.body)}
                    <div className="headerSearchPanel" id="headerSearch" ref={panelRef}>
                        <SearchBox key={session} autoFocus initialQuery={initial} syncUrl />
                    </div>
                </>
            )}
        </>
    );
}

const OPEN: KeyframeAnimationOptions = { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
const CLOSE: KeyframeAnimationOptions = { duration: 320, easing: "cubic-bezier(0.4, 0, 0.6, 1)" };

const heroSearch = () => document.querySelector<HTMLElement>(".heroSearch.entry");
const onScreen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
};

/**
 * Moves the panel between the hero's search field (`rect`) and its own place: the panel shrinks
 * onto the field and loses its frame, while everything below the field fades.
 */
function glide(panel: HTMLElement, rect: DOMRect, direction: "in" | "out") {
    const box = panel.querySelector<HTMLElement>(".searchBox")!;
    const field = box.getBoundingClientRect();
    const dx = rect.left - field.left, dy = rect.top - field.top, scale = rect.width / field.width;
    const transformOrigin = `${field.left - panel.getBoundingClientRect().left}px 0`;
    const away = { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin };
    const home = { transform: "none", transformOrigin };
    const opening = direction === "in";
    const timing: KeyframeAnimationOptions = opening ? OPEN : { ...CLOSE, fill: "forwards" };
    // The movement follows the snappy curve; the panel's frame fades on its own, gentler curve,
    // only while the panel is clearly larger than the field, so it doesn't flash in or out.
    const look = (el: Element) => {
        const style = getComputedStyle(el);
        return { backgroundColor: style.backgroundColor, borderColor: style.borderColor, boxShadow: style.boxShadow };
    };
    const frame = look(panel), noFrame = { backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none" };
    const fade: KeyframeAnimationOptions = { duration: timing.duration, easing: "ease-in-out", fill: timing.fill };
    const animations = [
        panel.animate(opening ? [away, home] : [home, away], timing),
        panel.animate(opening
            ? [noFrame, { ...noFrame, offset: 0.15 }, frame]
            : [frame, { ...noFrame, offset: 0.8 }, noFrame], fade),
    ];
    // The field inside the panel takes on the hero field's look at the far end, so swapping
    // one for the other is invisible.
    const heroBox = document.querySelector(".heroSearch.entry .searchBox");
    if (heroBox) animations.push(box.animate(opening ? [look(heroBox), look(box)] : [look(box), look(heroBox)], timing));
    panel.querySelectorAll(".below, .searchMode").forEach((el) => animations.push(el.animate(opening
        ? [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }]
        : [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], timing)));
    // The text in the field (query or placeholder) cross-fades with the hero field's own.
    animations.push(panel.querySelector("input")!.animate(opening
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1 }]
        : [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], timing));
    return animations;
}
