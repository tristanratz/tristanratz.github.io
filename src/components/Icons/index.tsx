import { IoLogoGithub, IoLogoInstagram, IoLogoLinkedin, IoLogoMedium, IoMail } from "react-icons/io5";
import { person } from "../../store/person";
import "./style.scss";

const links = [
    { href: person.linkedin, label: "LinkedIn", icon: <IoLogoLinkedin /> },
    { href: person.github, label: "GitHub", icon: <IoLogoGithub /> },
    { href: person.medium, label: "Medium", icon: <IoLogoMedium /> },
    { href: person.instagram, label: "Instagram", icon: <IoLogoInstagram /> },
    { href: person.email && "mailto:" + person.email, label: "Mail", icon: <IoMail /> },
];

export function Icons() {
    return (
        <div className="icons">
            {links.filter((l) => l.href).map((l) => (
                <a key={l.label} href={l.href} className="iconButton" aria-label={l.label} title={l.label}
                   {...(l.href!.startsWith("http") && { target: "_blank", rel: "noopener noreferrer" })}>
                    {l.icon}
                </a>
            ))}
        </div>
    );
}
