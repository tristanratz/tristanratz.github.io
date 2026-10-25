import { useEffect, useState } from "react";
import { IoLanguageOutline, IoMoonOutline, IoSunnyOutline } from "react-icons/io5";
import { useTheme } from "../../hooks/useTheme";
import { useUi } from "../../i18n";
import { routePath, useRoute } from "../../router";

/**
 * Theme and language at hand on the landing view, in its bottom corners. They step aside as soon
 * as the page scrolls (both are in the header's menu as well) and come back at the top.
 */
export function HeroCorners() {
    const ui = useUi();
    const { route } = useRoute();
    const { theme, toggle } = useTheme();
    const [away, setAway] = useState(false);
    const other = route.lang === "de" ? "en" : "de";

    useEffect(() => {
        const onScroll = () => setAway(window.scrollY > 40);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <div className={"heroCorners" + (away ? " away" : "")} aria-hidden={away}>
            <button className="corner left" onClick={toggle} tabIndex={away ? -1 : 0}
                    aria-label={theme === "dark" ? ui.theme.toLight : ui.theme.toDark}>
                {theme === "dark" ? <IoSunnyOutline /> : <IoMoonOutline />}
                <span>{theme === "dark" ? ui.menu.light : ui.menu.dark}</span>
            </button>
            <a className="corner right" href={routePath({ ...route, lang: other })} hrefLang={other} lang={other}
               title={ui.language.label} tabIndex={away ? -1 : 0}>
                <IoLanguageOutline />
                <span>{ui.language.switchTo}</span>
            </a>
        </div>
    );
}
