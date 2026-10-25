import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { contentWords, cosine, parseModel } from "./src/store/embeddings";
import projects from "./src/rsc/projects.json";
import { headTags, pageMeta } from "./src/seo";

// Strict CSP for the production build only; the dev server needs inline scripts.
// (JSON-LD is a data block, not a script, so it isn't affected.)
const csp = [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "script-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
].join("; ");

const cspPlugin = (): Plugin => ({
    name: "csp",
    apply: "build",
    transformIndexHtml: (html) =>
        html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
});

// Head tags (title, description, hreflang, link previews, structured data) between markers, so the
// pre-rendering step can replace them per page. In dev they describe the English home page.
const seoPlugin = (): Plugin => ({
    name: "seo",
    transformIndexHtml: (html) => html.replace(/<title>.*<\/title>/,
        `<!--seo-->\n    ${headTags(pageMeta({ lang: "en", project: null }))}\n    <!--/seo-->`),
});

/**
 * Lays the projects out on a 2D "similarity map": each project is embedded with the site's static
 * embedding model, and classical multidimensional scaling turns their distances into positions.
 * Computed at build time, so visitors don't download the model for it. Exposed as virtual:project-map.
 */
function projectMap() {
    const dir = "public/models/potion-multilingual/";
    const weights = readFileSync(dir + "embeddings.bin"), scales = readFileSync(dir + "scales.bin");
    const model = parseModel(readFileSync(dir + "vocab.txt", "utf8"),
        new Int8Array(weights.buffer, weights.byteOffset, weights.length),
        new Float32Array(scales.buffer.slice(scales.byteOffset, scales.byteOffset + scales.length)),
        JSON.parse(readFileSync(dir + "meta.json", "utf8")).dims);

    const vectors = projects.map((p) => {
        const summary = model.embed(contentWords([p.name, p.description, ...p.technologies, ...(p.keywords ?? [])].join(" ")));
        const text = model.embed(contentWords(p.text.join(" ")));
        const v = summary.map((x, i) => x + 0.5 * text[i]);
        const norm = Math.hypot(...v);
        return v.map((x) => x / norm);
    });
    const n = vectors.length;
    const distance = vectors.map((a) => vectors.map((b) => 1 - cosine(a, b)));

    // Classical MDS: double-centre the squared distances, take the top two eigenvectors.
    const sq = distance.map((row) => row.map((d) => d * d));
    const rowMean = sq.map((row) => row.reduce((s, x) => s + x, 0) / n);
    const total = rowMean.reduce((s, x) => s + x, 0) / n;
    const b = sq.map((row, i) => row.map((x, j) => -0.5 * (x - rowMean[i] - rowMean[j] + total)));
    const axes: number[][] = [];
    for (let k = 0; k < 3; k++) { // x, y and a third axis used as depth
        let v = Array.from({ length: n }, (_, i) => Math.sin(i + k + 1));
        let lambda = 0;
        for (let iter = 0; iter < 200; iter++) {
            const next = b.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
            axes.forEach((axis) => { // deflate the axes found already
                const dot = axis.reduce((s, x, i) => s + x * next[i], 0) / axis.reduce((s, x) => s + x * x, 0);
                next.forEach((_, i) => { next[i] -= dot * axis[i]; });
            });
            lambda = Math.hypot(...next);
            v = next.map((x) => x / (lambda || 1));
        }
        axes.push(v.map((x) => x * Math.sqrt(lambda)));
    }
    const scale = (values: number[]) => {
        const min = Math.min(...values), max = Math.max(...values);
        return values.map((x) => 0.1 + 0.8 * (x - min) / (max - min || 1));
    };
    const [xs, ys, zs] = axes.map(scale);

    // Gently push apart points that would overlap (measured on a 16:10 map), keeping the overall layout.
    const W = 1000, H = 625, MIN = 125;
    for (let iter = 0; iter < 300; iter++) {
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const dx = (xs[j] - xs[i]) * W, dy = (ys[j] - ys[i]) * H;
            const d = Math.hypot(dx, dy) || 0.01;
            if (d >= MIN) continue;
            const push = (MIN - d) / 2 / d;
            xs[i] -= (dx * push) / W; ys[i] -= (dy * push) / H;
            xs[j] += (dx * push) / W; ys[j] += (dy * push) / H;
        }
        for (let i = 0; i < n; i++) {
            xs[i] = Math.min(0.92, Math.max(0.08, xs[i]));
            ys[i] = Math.min(0.85, Math.max(0.1, ys[i]));
        }
    }
    return projects.map((_, i) => ({
        x: xs[i],
        y: ys[i],
        z: (zs[i] - 0.1) / 0.8, // 0 = far, 1 = near
        neighbors: distance[i].map((d, j) => [d, j]).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0]).slice(0, 2).map(([, j]) => j),
    }));
}

const projectMapPlugin = (): Plugin => ({
    name: "project-map",
    resolveId: (id) => (id === "virtual:project-map" ? "\0virtual:project-map" : undefined),
    load: (id) => (id === "\0virtual:project-map" ? `export default ${JSON.stringify(projectMap())};` : undefined),
});

export default defineConfig(({ isSsrBuild }) => ({
    plugins: [react(), cspPlugin(), seoPlugin(), projectMapPlugin()],
    // The server build (for pre-rendering) goes to its own folder and needs no static files.
    build: { outDir: isSsrBuild ? "build-ssr" : "build", copyPublicDir: !isSsrBuild },
}));
