import type { Lang } from "../router";
import { contentWords, cosine, EmbeddingModel, isStopword } from "./embeddings";
import { experienceId, getPerson } from "./person";
import { getProjects } from "./projects";

export type DocKind = "Profile" | "Experience" | "Project" | "Contact";

export interface Doc {
    kind: DocKind;
    title: string;
    answer: string;
    /** Short search terms in English and German; embedded for semantic search. */
    keywords: string;
    /** Longer text that only the keyword search looks at. */
    text?: string;
    /** Where a result leads: a project, a link, or a place on this page (element id). */
    action: { type: "project", index: number } | { type: "link", href: string, label: string } | { type: "scroll", id: string, label: string };
}

const labels = {
    en: {
        does: "What Tristan does", at: "at", about: "About", basedIn: "Based in", languages: "Languages",
        technologies: "Technologies", worksWith: "Works with", interests: "Interests", qualities: "Qualities",
        contact: "Get in touch", write: (email: string) => `Write to ${email}, or find Tristan on LinkedIn and GitHub.`,
        email: "Write an email", showAbout: "Show in About", showTimeline: "Show in timeline", and: "and",
    },
    de: {
        does: "Was Tristan macht", at: "bei", about: "Über mich", basedIn: "Wohnort", languages: "Sprachen",
        technologies: "Technologien", worksWith: "Arbeitet mit", interests: "Interessen", qualities: "Eigenschaften",
        contact: "Kontakt aufnehmen", write: (email: string) => `Schreib an ${email}, oder finde Tristan auf LinkedIn und GitHub.`,
        email: "E-Mail schreiben", showAbout: "Im Profil zeigen", showTimeline: "In der Zeitleiste zeigen", and: "und",
    },
};

/** Everything the search can answer, built from the same data as the rest of the site. */
export function getDocs(lang: Lang): Doc[] {
    const person = getPerson(lang), projects = getProjects(lang), l = labels[lang];
    const list = (items: string[]) => items.slice(0, -1).join(", ") + ` ${l.and} ` + items[items.length - 1];
    const showIn = (id: string, label = l.showAbout) => ({ type: "scroll" as const, id, label });
    return [
        {
            kind: "Profile", title: l.does,
            answer: `${person.job} ${l.at} ${person.employer}.`,
            keywords: "job work role position current team lead engineering employer company does " +
                "agent hub esm enterprise service management ai-native agents service industry " +
                "Beruf Arbeit Stelle Rolle Teamleiter Arbeitgeber Firma Service-Branche",
            action: showIn("about-working-at"),
        },
        ...person.about.map((paragraph): Doc => ({
            kind: "Profile", title: l.about, answer: paragraph, keywords: "about who background über Person Hintergrund",
            action: showIn("profile"),
        })),
        {
            kind: "Profile", title: l.basedIn,
            answer: `${person.city} ${person.locationHint ?? ""}, ${person.state}, ${person.country}.`,
            keywords: "where live location based city country home Wohnort wohnen Stadt Land Heimat",
            action: showIn("about-based-in"),
        },
        {
            kind: "Profile", title: l.languages,
            answer: person.languages.map((x) => `${x.name} (${x.level})`).join(", ") + ".",
            keywords: "languages speak spoken Sprachen sprechen Fremdsprachen",
            action: showIn("about-languages"),
        },
        {
            kind: "Profile", title: l.technologies,
            answer: `${l.worksWith} ${list(person.favTec)}.`,
            keywords: "technologies tech stack tools skills programming languages code Technologien Werkzeuge Fähigkeiten Programmieren Programmiersprachen",
            action: showIn("about-technologies"),
        },
        {
            kind: "Profile", title: l.interests,
            answer: list(person.interests) + ".",
            keywords: "interests interested topics research focus hobbies Interessen Themen Forschung Hobbys Freizeit",
            action: showIn("about-interests"),
        },
        {
            kind: "Profile", title: l.qualities,
            answer: list(person.qualities) + ".",
            keywords: "qualities strengths character personality Eigenschaften Stärken Charakter Persönlichkeit",
            action: showIn("about-qualities"),
        },
        {
            kind: "Contact", title: l.contact,
            answer: l.write(person.email),
            keywords: "contact reach email mail hire talk message linkedin github Kontakt erreichen schreiben Nachricht einstellen",
            action: { type: "link", href: "mailto:" + person.email, label: l.email },
        },
        ...person.path.map((step, i): Doc => ({
            kind: "Experience", title: `${step.title}, ${step.where}`,
            answer: `${step.period ?? step.when}: ${step.title} ${l.at} ${step.where}.${step.note ? " " + step.note + "." : ""}`,
            keywords: (step.education
                ? "education study studied university degree thesis Ausbildung Studium studieren studiert Universität Abschluss "
                : "experience career cv Erfahrung Werdegang Lebenslauf ") + step.when,
            action: showIn(experienceId(i), l.showTimeline),
        })),
        ...projects.map((p, i): Doc => ({
            kind: "Project", title: p.name, answer: p.description,
            keywords: ["project", "Projekt", ...p.technologies, ...(p.keywords ?? [])].join(" "),
            text: [p.date, p.text.join(" ")].join(" "),
            action: { type: "project", index: i },
        })),
    ];
}

const stopwords = new Set(("a an and are as at be by can do does for from has have he his how i in is it me my of on " +
    "or show tell that the to was what when where which who why with you your tristan about any some").split(" "));

const synonyms: Record<string, string[]> = {
    contact: ["email", "mail", "reach", "hire"],
    job: ["work", "role", "position", "employer"],
    work: ["job", "role", "position", "employer", "does"],
    study: ["education", "university", "degree", "thesis"],
    paper: ["publication", "research", "naacl"],
    speak: ["languages"],
    live: ["location", "based"],
    rag: ["retrieval", "augmented", "generation"],
    llm: ["llms", "language", "models"],
    ai: ["llm", "nlp", "machine", "learning"],
    // German questions on the German pages
    wohnt: ["wohnort", "wohnen"],
    lebt: ["wohnort", "wohnen"],
    woher: ["wohnort", "heimat"],
    arbeitet: ["beruf", "arbeit", "arbeitgeber"],
    erreichen: ["kontakt", "mail"],
    sprachen: ["sprachen", "languages"],
    ki: ["ai", "llm", "nlp"],
};

const normalize = (word: string) => word.toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[^a-z0-9]+/g, "");
// English and German stopwords are ignored, since the German pages are searched with German questions.
const tokenize = (s: string) => s.toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter((t) => t.length > 1 && !stopwords.has(t) && !isStopword(t));

interface Corpus {
    docs: Doc[];
    index: { title: string[], body: string[] }[];
    /** Curated words (titles and keywords) that typos may be corrected to. */
    vocabulary: Set<string>;
    avgLength: number;
    vectors?: Float32Array[][];
}

const corpora: Partial<Record<Lang, Corpus>> = {};

/** The search index for one language, built on first use. */
function corpus(lang: Lang): Corpus {
    if (!corpora[lang]) {
        const docs = getDocs(lang);
        const index = docs.map((d) => ({ title: tokenize(d.title), body: tokenize(`${d.answer} ${d.keywords} ${d.text ?? ""}`) }));
        const vocabulary = new Set(docs.flatMap((d) => tokenize(`${d.title} ${d.keywords}`)));
        corpora[lang] = { docs, index, vocabulary, avgLength: index.reduce((sum, d) => sum + d.body.length, 0) / index.length };
    }
    return corpora[lang]!;
}

/** Damerau–Levenshtein distance (with adjacent swaps), stopping early above `max`. */
function editDistance(a: string, b: string, max: number) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        let rowMin = Infinity;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            rowMin = Math.min(rowMin, d[i][j]);
        }
        if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
}

export type MatchKind = "exact" | "prefix" | "typo" | "synonym";

/**
 * How well query term `q` matches document word `t`: weight and kind, or null. Typos are only corrected
 * towards curated words, otherwise "wetter" would find "weiter" somewhere in a long text.
 */
function match(q: string, t: string, typoTarget: boolean): { weight: number, kind: MatchKind } | null {
    if (t === q) return { weight: 1, kind: "exact" };
    if ((q.length >= 3 && t.startsWith(q)) || (t.length >= 4 && q.startsWith(t))) return { weight: 0.9, kind: "prefix" };
    // Typos: same first letter (real typos almost always keep it; otherwise "wetter" would match "better"),
    // one edit from 5 letters, two from 8.
    if (typoTarget && q.length >= 5 && t.length >= 4 && q[0] === t[0] && editDistance(q, t, q.length >= 8 ? 2 : 1) <= (q.length >= 8 ? 2 : 1)) {
        return { weight: 0.7, kind: "typo" };
    }
    return null;
}

export interface Match {
    term: string;
    word: string;
    kind: MatchKind;
    /** For synonyms: the query word they stand in for. */
    synonymOf?: string;
}

export interface Result {
    doc: Doc;
    /** BM25 score; 0 if only the semantic search found it. */
    keyword: number;
    /** Cosine similarity, only in semantic mode. */
    semantic?: number;
    /** Which query terms matched which words, and how. */
    matches: Match[];
    /** The sentence that best matches the query, to show instead of the whole text. */
    snippet: string;
    /** No real match: only the closest topic by meaning (semantic mode). */
    fallback?: boolean;
}

const queryTerms = (query: string) => {
    const terms = new Map<string, string | null>(); // term -> query word it is a synonym of (null: typed itself)
    for (const t of tokenize(query)) {
        terms.set(t, null);
        for (const s of synonyms[t] ?? []) if (!terms.has(s)) terms.set(s, t);
    }
    return terms;
};

/** Picks the sentence with the most matched words; falls back to the answer. */
function bestSentence(doc: Doc, words: Set<string>) {
    const sentences = `${doc.answer} ${doc.text ?? ""}`.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
    let best = doc.answer, bestScore = 0;
    for (const sentence of sentences) {
        const score = new Set(sentence.split(/[^\p{L}\p{N}]+/u).map(normalize).filter((w) => words.has(w))).size;
        if (score > bestScore) { best = sentence; bestScore = score; }
    }
    return best;
}

/** BM25 ranking with a title boost, prefix and typo matching and a few synonyms. */
function keywordResults(query: string, lang: Lang): Result[] {
    const { docs, index, avgLength, vocabulary } = corpus(lang);
    const terms = queryTerms(query);
    if (!terms.size) return [];
    // Words repeat a lot across documents, so each (term, word) pair is compared only once.
    const memo = new Map<string, ReturnType<typeof match>>();
    const cachedMatch = (term: string, word: string) => {
        const key = term + " " + word;
        if (!memo.has(key)) memo.set(key, match(term, word, vocabulary.has(word)));
        return memo.get(key)!;
    };
    // Per term and document: weighted term frequency and the matched words.
    const perTerm = [...terms].map(([term, synonymOf]) => index.map(({ title, body }) => {
        let tf = 0;
        const found = new Map<string, MatchKind>();
        for (const t of body) {
            const m = cachedMatch(term, t);
            if (m) { tf += m.weight; found.set(t, synonymOf ? "synonym" : m.kind); }
        }
        const inTitle = title.some((t) => cachedMatch(term, t));
        return { term, synonymOf, tf, inTitle, found };
    }));
    return index
        .map(({ body }, i) => {
            let score = 0;
            const matches: Match[] = [];
            for (const termDocs of perTerm) {
                const { term, synonymOf, tf, inTitle, found } = termDocs[i];
                if (!tf && !inTitle) continue;
                const n = termDocs.filter((d) => d.tf > 0 || d.inTitle).length;
                const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
                const bm25 = tf / (tf + 1.2 * (0.25 + 0.75 * body.length / avgLength));
                score += idf * (bm25 + (inTitle ? 1.5 : 0));
                found.forEach((kind, word) => matches.push({ term, word, kind, synonymOf: synonymOf ?? undefined }));
            }
            return { doc: docs[i], keyword: score, matches, snippet: "" };
        })
        .filter((r) => r.keyword > 0)
        .sort((a, b) => b.keyword - a.keyword)
        .map((r) => ({ ...r, snippet: bestSentence(r.doc, new Set(r.matches.map((m) => m.word))) }));
}

export function search(query: string, lang: Lang = "en", limit = 4): Result[] {
    return keywordResults(query, lang).slice(0, limit);
}

// Semantic search (proof of concept): cosine similarity of static embeddings,
// fused with the BM25 ranking through reciprocal rank fusion.
// Title, answer and keywords are embedded separately and the best match counts,
// so short precise fields aren't drowned out by averaging.
const MIN_SIMILARITY = 0.47; // tuned so nonsense queries ("football", "Kochen") return no real match
// Without any real match, the closest topics above this are still offered, marked as such,
// so the semantic search almost always has an answer. Below it (gibberish) it stays empty.
const FALLBACK_SIMILARITY = 0.3;

export function semanticSearch(query: string, model: EmbeddingModel, lang: Lang = "en", limit = 4,
                               minSimilarity = MIN_SIMILARITY): Result[] {
    if (!query.trim()) return [];
    const c = corpus(lang), docs = c.docs;
    c.vectors ??= docs.map((d) => [d.title, d.answer, d.keywords].map((field) => model.embed(contentWords(field))));
    const q = model.embed(contentWords(query));
    const similarity = new Map(docs.map((doc, i) => [doc, Math.max(...c.vectors![i].map((v) => cosine(q, v)))]));
    const semantic = docs.filter((d) => similarity.get(d)! >= minSimilarity)
        .sort((a, b) => similarity.get(b)! - similarity.get(a)!);
    const keyword = keywordResults(query, lang);

    // Keywords weigh twice as much: the small static model mostly adds matches and breaks ties.
    const fused = new Map<Doc, number>();
    const add = (ranking: Doc[], weight: number) => ranking.forEach((doc, rank) =>
        fused.set(doc, (fused.get(doc) ?? 0) + weight / (60 + rank)));
    add(semantic, 1);
    add(keyword.map((r) => r.doc), 2);
    if (!fused.size) {
        // Only for queries made of real words: gibberish ("asdf qwer") falls apart into word pieces.
        const words = contentWords(query).split(/\s+/).filter(Boolean);
        const known = words.filter((word) => model.tokenize(word).length === 1).length;
        if (known * 2 < words.length) return [];
        return docs.filter((d) => similarity.get(d)! >= FALLBACK_SIMILARITY)
            .sort((a, b) => similarity.get(b)! - similarity.get(a)!)
            .slice(0, 2)
            .map((doc) => ({ doc, keyword: 0, matches: [], snippet: doc.answer, semantic: similarity.get(doc), fallback: true }));
    }
    const byDoc = new Map(keyword.map((r) => [r.doc, r]));
    return [...fused].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([doc]) => ({
        ...(byDoc.get(doc) ?? { doc, keyword: 0, matches: [], snippet: doc.answer }),
        semantic: similarity.get(doc),
    }));
}

/** Normalised form used to compare words in a text with matched words. */
export const normalizeWord = normalize;

