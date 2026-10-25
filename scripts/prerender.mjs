// Pre-renders every page (home and each project, in English and German) into static HTML with its own
// title, description, hreflang links and structured data. Runs after `vite build` and `vite build --ssr`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const { render, allRoutes, pageMeta, headTags, sitemap } = await import("../build-ssr/entry-server.js");

const template = readFileSync("build/index.html", "utf8");
const page = (meta, body) => template
    .replace(/<html lang="[^"]*">/, `<html lang="${meta.lang}">`)
    .replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, `<!--seo-->\n    ${headTags(meta)}\n    <!--/seo-->`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);

let count = 0;
for (const route of allRoutes()) {
    const meta = pageMeta(route);
    const path = new URL(meta.url).pathname;
    const file = join("build", path, "index.html");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, page(meta, render(path)));
    count++;
}

// Unknown URLs: GitHub Pages serves 404.html; the app renders client-side and search engines skip it.
writeFileSync("build/404.html", template
    .replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, '<title>Not found – Tristan Ratz</title>\n    <meta name="robots" content="noindex" />'));

const site = new URL(pageMeta(allRoutes()[0]).url).origin;
writeFileSync("build/sitemap.xml", sitemap(new Date().toISOString().slice(0, 10)));
writeFileSync("build/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
console.log(`pre-rendered ${count} pages`);
