import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme(): Theme {
    const stored = document.documentElement.dataset.theme;
    if (stored === "light" || stored === "dark") return stored;
    return media().matches ? "dark" : "light";
}

export function useTheme() {
    // Starts as "light" so the pre-rendered HTML and the first client render agree; corrected after mount.
    const [theme, setTheme] = useState<Theme>("light");

    useEffect(() => {
        setTheme(currentTheme());
        const onChange = () => setTheme(currentTheme());
        const query = media();
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    const toggle = () => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("theme", next); } catch { /* storage unavailable */ }
        setTheme(next);
    };

    return { theme, toggle };
}
