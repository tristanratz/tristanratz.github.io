import { useEffect, useRef, useState } from "react";
import { IoEllipsisHorizontal, IoLanguageOutline, IoMoonOutline, IoSunnyOutline } from "react-icons/io5";
import { useTheme } from "../../hooks/useTheme";
import { useUi } from "../../i18n";
import { routePath, useRoute } from "../../router";

/**
 * The header's small settings menu: language and colour theme. Opens on click, and on hover where
 * there is one; closes on Escape, a click elsewhere, or when the pointer has left it for a moment. It
 * unfolds from its button, the entries following one after the other.
 */
export function HeaderMenu() {
    const ui = useUi();
    const { route } = useRoute();
    const { theme, toggle } = useTheme();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const leaveTimer = useRef(0);
    const hoveredOpen = useRef(0); // when hovering opened it
    const other = route.lang === "de" ? "en" : "de";

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        window.addEventListener("keydown", onKey);
        window.addEventListener("pointerdown", onDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("pointerdown", onDown);
        };
    }, [open]);

    // Hover only where the pointer can hover (not on touch screens, where it would fight the tap).
    const hoverable = () => window.matchMedia("(hover: hover)").matches;
    const onEnter = () => {
        window.clearTimeout(leaveTimer.current);
        if (!hoverable() || open) return;
        hoveredOpen.current = performance.now();
        setOpen(true);
    };
    // A click right after hovering opened it means "open", not "close again".
    const onClick = () => {
        if (open && performance.now() - hoveredOpen.current < 600) return;
        setOpen(!open);
    };
    const onLeave = () => {
        if (!hoverable()) return;
        leaveTimer.current = window.setTimeout(() => setOpen(false), 250);
    };

    return (
        <div className={"headerMenu" + (open ? " open" : "")} ref={ref} onMouseEnter={onEnter} onMouseLeave={onLeave}>
            <button className="menuButton" aria-expanded={open} aria-haspopup="true" aria-controls="headerMenu"
                    aria-label={ui.menu.label} title={ui.menu.label} onClick={onClick}>
                <IoEllipsisHorizontal />
            </button>
            {/* Stays in the page so it can animate closed too; closed it's inert (no focus, no clicks). */}
            <div className="menuPanel" id="headerMenu" role="group" aria-label={ui.menu.label} {...(!open && { inert: "" })}>
                <a href={routePath({ ...route, lang: other })} hrefLang={other} lang={other} title={ui.language.label}>
                    <IoLanguageOutline /> {ui.language.switchTo}
                </a>
                <button onClick={() => { toggle(); setOpen(false); }}>
                    {theme === "dark" ? <IoSunnyOutline /> : <IoMoonOutline />}
                    {theme === "dark" ? ui.menu.light : ui.menu.dark}
                </button>
            </div>
        </div>
    );
}
