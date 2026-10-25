import { useEffect, useState } from "react";
import { useUi } from "../../i18n";
import { person } from "../../store/person";
import { HeaderMenu } from "./HeaderMenu";
import { HeaderSearch } from "./HeaderSearch";
import "./style.scss";

const sections = ["about", "projects", "contact"] as const;

export function Header() {
    const ui = useUi();
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
                <div className="headerTools">
                    <HeaderSearch />
                    <HeaderMenu />
                </div>
            </nav>
        </header>
    );
}
