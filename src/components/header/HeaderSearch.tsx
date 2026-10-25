import { useEffect, useRef, useState } from "react";
import { IoSearch } from "react-icons/io5";
import { prefersReducedMotion, useIsomorphicLayoutEffect } from "../../env";
import { useUi } from "../../i18n";
import { SearchBox } from "../intro/SearchBox";

/**
 * The search overlay below the top bar. Opened by its button, Cmd/Ctrl+K, "/", a ?q= link, or by
 * typing into the hero search, in which case it glides up out of the hero's search field.
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

    const show = (query = "", rect: DOMRect | null = null) => {
        setInitial(query);
        from.current = rect;
        setSession((s) => s + 1);
        setOpen(true);
    };
    const hide = () => {
        setOpen(false);
        // The shared ?q= link belongs to the open search.
        const url = new URL(window.location.href);
        if (url.searchParams.has("q")) {
            url.searchParams.delete("q");
            window.history.replaceState(window.history.state, "", url);
        }
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

    // Glide from the hero's search field into place, while the backdrop and results fade in.
    useIsomorphicLayoutEffect(() => {
        const panel = panelRef.current, rect = from.current;
        if (!open || !panel || !rect || prefersReducedMotion()) return;
        from.current = null;
        const field = panel.querySelector(".searchBox")!.getBoundingClientRect();
        const dx = rect.left - field.left, dy = rect.top - field.top, scale = rect.width / field.width;
        const timing = { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
        panel.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin: `${field.left - panel.getBoundingClientRect().left}px 0`, boxShadow: "none", backgroundColor: "transparent", borderColor: "transparent" },
            { transform: "none", transformOrigin: `${field.left - panel.getBoundingClientRect().left}px 0` },
        ], timing);
        panel.querySelectorAll(".below, .searchMode").forEach((el) =>
            el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], timing));
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
                    <div className="searchBackdrop" onPointerDown={hide} />
                    <div className="headerSearchPanel" id="headerSearch" ref={panelRef}>
                        <SearchBox key={session} autoFocus initialQuery={initial} syncUrl />
                    </div>
                </>
            )}
        </>
    );
}
