import { useEffect, useRef, useState } from "react";
import { IoSearch } from "react-icons/io5";
import { useUi } from "../../i18n";
import { SearchBox } from "../intro/SearchBox";

// Search in the top bar: a button that opens the same search as the hero in a panel.
export function HeaderSearch() {
    const ui = useUi();
    const [open, setOpen] = useState(false);
    // Set after mount: the pre-rendered HTML can't know the visitor's platform.
    const [shortcut, setShortcut] = useState("Ctrl K");
    useEffect(() => setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"), []);
    const panelRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
            if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
                e.preventDefault();
                setOpen(true);
            } else if (e.key === "Escape") {
                setOpen((wasOpen) => {
                    if (wasOpen) buttonRef.current?.focus();
                    return false;
                });
            }
        };
        const close = () => setOpen(false);
        window.addEventListener("keydown", onKey);
        window.addEventListener("project:open", close);
        window.addEventListener("search:navigate", close);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("project:open", close);
            window.removeEventListener("search:navigate", close);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => {
            const target = e.target as Node;
            if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
        };
        document.addEventListener("pointerdown", onPointer);
        return () => document.removeEventListener("pointerdown", onPointer);
    }, [open]);

    return (
        <>
            <button ref={buttonRef} className="searchButton" onClick={() => setOpen(!open)}
                    aria-expanded={open} aria-controls="headerSearch" aria-label={ui.search.button}>
                <IoSearch />
                <span className="label">{ui.search.button}</span>
                <kbd>{shortcut}</kbd>
            </button>
            {open && (
                <div className="headerSearchPanel" id="headerSearch" ref={panelRef}>
                    <SearchBox autoFocus />
                </div>
            )}
        </>
    );
}
