import { useEffect, useState } from "react";
import { IoMoonOutline, IoSunnyOutline } from "react-icons/io5";
import { useTheme } from "../../hooks/useTheme";
import { useUi } from "../../i18n";
import { routePath, useRoute } from "../../router";
import { person } from "../../store/person";
import { HeaderSearch } from "./HeaderSearch";
import "./style.scss";

const sections = ["about", "projects", "contact"] as const;

export function Header() {
    const ui = useUi();
    const { route } = useRoute();
    const { theme, toggle } = useTheme();
    const [scrolled, setScrolled] = useState(false);
    const [active, setActive] = useState<string | null>(null);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
        }, { rootMargin: "-45% 0px -50% 0px" });
        ["intro", "experience", ...sections].forEach((id) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    return (
        <header className={"siteHeader" + (scrolled ? " scrolled" : "")}>
            <nav className="headerInner" aria-label={ui.nav.main}>
                <a href="#intro" className="brand" aria-label={ui.nav.backToTop}>
                    <span className="brandFull">{person.firstName} <em>{person.lastName}</em></span>
                    <span className="brandShort">T<em>R</em></span>
                </a>
                <ul>
                    {sections.map((id) => (
                        <li key={id}>
                            <a href={"#" + id} aria-current={active === id ? "true" : undefined}>{ui.nav[id]}</a>
                        </li>
                    ))}
                </ul>
                <HeaderSearch />
                <a className="languageSwitch" href={routePath({ ...route, lang: route.lang === "de" ? "en" : "de" })}
                   hrefLang={route.lang === "de" ? "en" : "de"} lang={route.lang === "de" ? "en" : "de"} title={ui.language.label}>
                    {route.lang === "de" ? "EN" : "DE"}
                </a>
                <button className="iconButton" onClick={toggle}
                        aria-label={theme === "dark" ? ui.theme.toLight : ui.theme.toDark}>
                    {theme === "dark" ? <IoSunnyOutline /> : <IoMoonOutline />}
                </button>
            </nav>
        </header>
    );
}
