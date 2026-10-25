import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseModel } from "./embeddings";
import { search, semanticSearch } from "./knowledge";

// Questions and the entry that should come first. Guards against content or keyword
// changes silently making the search worse.
const expected: [string, string][] = [
    ["which languages does he speak", "Languages"],
    ["how can I get in touch", "Get in touch"],
    ["what is his job", "What Tristan does"],
    ["what did he study", "M.Sc. Information Systems"],
    ["climate", "diverSATy"],
    ["image annotation", "Interactive Image Segmentation"],
    ["hobbies", "Interests"],
    ["summaries research", "Paper"],
    ["Welche Sprachen spricht er?", "Languages"],
    ["Wie kann ich ihn erreichen?", "Get in touch"],
    ["Was ist sein Beruf?", "What Tristan does"],
    ["Was hat er studiert?", "M.Sc. Information Systems"],
    ["Klimawandel", "diverSATy"],
    ["Bilder beschriften", "Interactive Image Segmentation"],
    ["Hobbys", "Interests"],
    ["Masterarbeit", "ITRF"],
    ["Veröffentlichung", "Paper"],
    ["Bausicht", "Data Analyst"],
    ["Agent Hub", "(What Tristan does|About|Engineering Team Lead)"],
];

const typos: [string, string][] = [
    ["langauges", "Languages"],
    ["Masterarbiet", "ITRF"],
    ["Klimawandl", "diverSATy"],
    ["segmentaton", "Interactive Image Segmentation"],
];

const nonsense = ["football", "Fußball", "cooking", "Kochen", "vacation", "Urlaub", "weather", "Wetter"];

const model = (() => {
    const dir = "public/models/potion-multilingual/";
    const meta = JSON.parse(readFileSync(dir + "meta.json", "utf8"));
    const weights = readFileSync(dir + "embeddings.bin");
    const scales = readFileSync(dir + "scales.bin");
    return parseModel(
        readFileSync(dir + "vocab.txt", "utf8"),
        new Int8Array(weights.buffer, weights.byteOffset, weights.length),
        new Float32Array(scales.buffer.slice(scales.byteOffset, scales.byteOffset + scales.length)),
        meta.dims,
    );
})();

describe.each([
    ["keyword search", (q: string) => search(q)],
    ["semantic search", (q: string) => semanticSearch(q, model)],
])("%s", (_, run) => {
    it.each(expected)("“%s” finds %s first", (query, title) => {
        expect(run(query)[0]?.doc.title).toMatch(new RegExp("^" + title));
    });
    it.each(typos)("tolerates the typo “%s” (%s)", (query, title) => {
        expect(run(query)[0]?.doc.title).toMatch(new RegExp("^" + title));
    });
    it.each(nonsense)("finds no real match for “%s”", (query) => {
        // The semantic search may offer the closest topics, but only marked as fallback.
        expect(run(query).every((r) => r.fallback)).toBe(true);
    });
});

// Paraphrases with few or no shared keywords: the semantic search should still answer.
const paraphrases = [
    "what is he good at", "does he know machine learning", "career", "teamwork", "his education", "can I hire him",
    "is he available for talks", "where can I find his code", "what tools does he use", "favourite topics", "hobbies",
    "Was macht er beruflich?", "Programmiersprachen", "Erfahrung mit KI", "Studium", "Wo wohnt er?", "summaries",
    "chat app", "climate", "remote work", "images", "banking", "where is he from",
];

describe("semantic search robustness", () => {
    it("answers almost every question", () => {
        const answered = paraphrases.filter((q) => semanticSearch(q, model).length > 0);
        expect(answered.length / paraphrases.length).toBeGreaterThanOrEqual(0.95);
    });
    it("stays empty for gibberish", () => {
        expect(semanticSearch("asdf qwer zxcv", model)).toEqual([]);
    });
});

// The German pages search German texts.
const german: [string, string][] = [
    ["Wo wohnt er?", "Wohnort"],
    ["Welche Sprachen spricht er?", "Sprachen"],
    ["Wie kann ich ihn erreichen?", "Kontakt aufnehmen"],
    ["Woran arbeitet er?", "Was Tristan macht"],
    ["Klimawandel", "diverSATy"],
    ["Masterarbeit", "(ITRF|M\\.Sc)"],
];

describe("German pages", () => {
    it.each(german)("“%s” finds %s first", (query, title) => {
        expect(search(query, "de")[0]?.doc.title).toMatch(new RegExp("^" + title));
    });
    it("answers in German", () => {
        expect(search("Sprachen", "de")[0].doc.answer).toContain("Deutsch");
    });
    it.each(nonsense)("finds nothing for “%s”", (query) => {
        expect(search(query, "de")).toEqual([]);
    });
});

describe("result details", () => {
    it("explains matches and picks the best sentence", () => {
        const [top] = search("reranker");
        expect(top.matches.some((m) => m.word === "reranker" || m.word === "rerankers")).toBe(true);
        expect(top.snippet.toLowerCase()).toContain("reranker");
    });
    it("marks typo matches as such", () => {
        expect(search("langauges")[0].matches.some((m) => m.kind === "typo")).toBe(true);
    });
});
