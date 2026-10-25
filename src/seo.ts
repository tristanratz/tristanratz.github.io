// Per-page metadata for search engines and link previews, shared by the dev server (vite.config.ts)
// and the pre-rendering step (scripts/prerender.mjs).
import { Lang, Route, routePath } from "./router";
import { getPerson, person } from "./store/person";
import { getProjects } from "./store/projects";

export const site = person.website.replace(/\/$/, "");
const langs: Lang[] = ["en", "de"];

export interface PageMeta {
    lang: Lang;
    url: string;
    title: string;
    description: string;
    image: string;
    type: "profile" | "article";
    alternates: { lang: string, href: string }[];
    jsonLd: object;
}

/** Every page of the site: the home page and one page per project, in each language. */
export const allRoutes = (): Route[] => langs.flatMap((lang) =>
    [null, ...getProjects(lang).map((p) => p.slug)].map((project) => ({ lang, project })));

const shorten = (text: string, max = 160) => (text.length <= max ? text : text.slice(0, text.lastIndexOf(" ", max - 1)) + " …");

export function pageMeta(route: Route): PageMeta {
    const p = getPerson(route.lang);
    const name = `${p.firstName} ${p.lastName}`;
    const url = site + routePath(route);
    const alternates = [
        ...langs.map((lang) => ({ lang, href: site + routePath({ ...route, lang }) })),
        { lang: "x-default", href: site + routePath({ ...route, lang: "en" }) },
    ];
    const personLd = {
        "@type": "Person",
        "@id": `${site}/#person`,
        name,
        url: site + "/",
        image: `${site}/img/tristan-ratz.jpg`,
        jobTitle: p.job,
        worksFor: { "@type": "Organization", name: p.employer, url: p.path[0].url },
        alumniOf: { "@type": "CollegeOrUniversity", name: "TU Darmstadt", url: "https://www.tu-darmstadt.de" },
        address: { "@type": "PostalAddress", addressLocality: p.city, addressRegion: p.state, addressCountry: "DE" },
        knowsAbout: [...person.interests, ...p.favTec],
        knowsLanguage: person.languages.map((l) => l.name),
        sameAs: [p.linkedin, p.github, p.medium, p.instagram].filter(Boolean),
    };

    const project = route.project ? getProjects(route.lang).find((x) => x.slug === route.project) : undefined;
    if (project) {
        return {
            lang: route.lang, url, alternates, type: "article",
            title: `${project.name} – ${name}`,
            description: shorten(project.description),
            image: site + project.image,
            jsonLd: {
                "@context": "https://schema.org",
                "@type": project.name.startsWith("Paper") ? "ScholarlyArticle" : "CreativeWork",
                name: project.name,
                headline: project.name,
                description: project.description,
                url,
                image: site + project.image,
                inLanguage: route.lang,
                dateCreated: project.date,
                keywords: project.technologies.join(", "),
                author: personLd,
                sameAs: [project.link, project.github].filter(Boolean),
            },
        };
    }

    const de = route.lang === "de";
    return {
        lang: route.lang, url, alternates, type: "profile",
        title: `${name} – Engineering Team Lead ${de ? "für KI, Suche & Wissen" : "for AI, Search & Knowledge"}`,
        description: de
            ? `${name}, ${p.job} bei ${p.employer} in ${p.city}. ${p.slogan}. Projekte zu NLP, Retrieval Augmented Generation und Suche.`
            : `${name}, ${p.job} at ${p.employer} in ${p.city}. ${p.slogan}. Projects in NLP, retrieval augmented generation and search.`,
        image: `${site}/img/tristan-ratz.jpg`,
        jsonLd: { "@context": "https://schema.org", "@type": "ProfilePage", url, inLanguage: route.lang, mainEntity: personLd },
    };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The <head> tags for a page. */
export function headTags(meta: PageMeta) {
    return [
        `<title>${escape(meta.title)}</title>`,
        `<meta name="description" content="${escape(meta.description)}" />`,
        `<link rel="canonical" href="${meta.url}" />`,
        ...meta.alternates.map((a) => `<link rel="alternate" hreflang="${a.lang}" href="${a.href}" />`),
        `<meta property="og:type" content="${meta.type}" />`,
        `<meta property="og:title" content="${escape(meta.title)}" />`,
        `<meta property="og:description" content="${escape(meta.description)}" />`,
        `<meta property="og:url" content="${meta.url}" />`,
        `<meta property="og:image" content="${meta.image}" />`,
        `<meta property="og:locale" content="${meta.lang === "de" ? "de_DE" : "en_US"}" />`,
        `<meta name="twitter:card" content="${meta.type === "article" ? "summary_large_image" : "summary"}" />`,
        // "<" is escaped so the JSON can never close the script element.
        `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`,
    ].join("\n    ");
}

/** sitemap.xml with all pages and their language versions. */
export function sitemap(lastmod: string) {
    const urls = allRoutes().map((route) => {
        const meta = pageMeta(route);
        const links = meta.alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.href}" />`).join("\n");
        return `  <url>\n    <loc>${meta.url}</loc>\n    <lastmod>${lastmod}</lastmod>\n${links}\n  </url>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
        `xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}
