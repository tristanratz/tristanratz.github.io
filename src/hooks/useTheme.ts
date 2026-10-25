import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

// Dark unless the visitor chose light (theme-init.js sets data-theme before the first paint).
const currentTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** Keeps the browser's UI colour in line with the theme. */
const setThemeColor = (theme: Theme) =>
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0f15" : "#f6f8fb");

export function useTheme() {
    // Starts as "dark" (the default) so the pre-rendered HTML and the first client render agree; corrected after mount.
    const [theme, setTheme] = useState<Theme>("dark");

    useEffect(() => {
        setTheme(currentTheme());
        setThemeColor(currentTheme());
        // Every place that shows the theme (header menu, hero corner) follows a switch made in another.
        const observer = new MutationObserver(() => setTheme(currentTheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const toggle = () => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("theme", next); } catch { /* storage unavailable */ }
        setThemeColor(next);
        setTheme(next);
    };

    return { theme, toggle };
}
