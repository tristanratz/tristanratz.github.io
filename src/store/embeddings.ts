// Static, multilingual text embeddings (Model2Vec, potion-multilingual-128M, shrunk at build time)
// computed in plain TypeScript in the browser. A text vector is the normalised mean of its token
// vectors; no neural network runs at query time and nothing is sent to a server.

const BASE = "/models/potion-multilingual/";

export interface EmbeddingModel {
    embed(text: string): Float32Array;
    tokenize(text: string): string[];
    dims: number;
}

interface ModelData {
    pieces: string[];
    scores: Float32Array;
    dims: number;
    /** Adds the vector of token `id` to `target`. */
    addRow(id: number, target: Float32Array): void;
}

/** SentencePiece-style Unigram tokenizer: picks the most probable split of each word (Viterbi). */
function unigramTokenizer(pieces: string[], scores: Float32Array) {
    const index = new Map<string, number>();
    let maxLength = 1, minScore = 0;
    pieces.forEach((piece, i) => {
        index.set(piece, i);
        maxLength = Math.max(maxLength, piece.length);
        minScore = Math.min(minScore, scores[i]);
    });
    const unknownScore = minScore - 10;

    const splitWord = (word: string, ids: number[]) => {
        const n = word.length;
        const best = new Float64Array(n + 1).fill(-Infinity);
        const from = new Int32Array(n + 1);
        const token = new Int32Array(n + 1);
        best[0] = 0;
        for (let i = 0; i < n; i++) {
            if (best[i] === -Infinity) continue;
            for (let length = 1; length <= Math.min(maxLength, n - i); length++) {
                const id = index.get(word.slice(i, i + length));
                if (id === undefined) continue;
                const score = best[i] + scores[id];
                if (score > best[i + length]) { best[i + length] = score; from[i + length] = i; token[i + length] = id; }
            }
            // Characters the vocabulary doesn't know become an unknown token, which is ignored later.
            if (best[i] + unknownScore > best[i + 1]) { best[i + 1] = best[i] + unknownScore; from[i + 1] = i; token[i + 1] = -1; }
        }
        const reversed: number[] = [];
        for (let end = n; end > 0; end = from[end]) if (token[end] >= 0) reversed.push(token[end]);
        ids.push(...reversed.reverse());
    };

    return (text: string) => {
        const ids: number[] = [];
        const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
        if (normalized) normalized.split(" ").forEach((word) => splitWord("▁" + word, ids));
        return ids;
    };
}

export function createModel({ pieces, scores, dims, addRow }: ModelData): EmbeddingModel {
    const tokenize = unigramTokenizer(pieces, scores);
    return {
        dims,
        tokenize: (text) => tokenize(text).map((id) => pieces[id]),
        embed(text) {
            const vector = new Float32Array(dims);
            for (const id of tokenize(text)) addRow(id, vector);
            const norm = Math.hypot(...vector) || 1;
            for (let d = 0; d < dims; d++) vector[d] /= norm;
            return vector;
        },
    };
}

/** Parses the files written by scripts/build-embeddings.mjs. */
export function parseModel(vocabText: string, weights: Int8Array, scales: Float32Array, dims: number): EmbeddingModel {
    const pieces: string[] = [];
    const scoreList: number[] = [];
    for (const line of vocabText.split("\n")) {
        if (!line) continue;
        const tab = line.lastIndexOf("\t");
        pieces.push(line.slice(0, tab));
        scoreList.push(Number(line.slice(tab + 1)));
    }
    return createModel({
        pieces,
        scores: Float32Array.from(scoreList),
        dims,
        addRow(id, target) {
            const scale = scales[id], offset = id * dims;
            for (let d = 0; d < dims; d++) target[d] += weights[offset + d] * scale;
        },
    });
}

let loading: Promise<EmbeddingModel> | null = null;

/** Loads the model once, from this domain only. */
export function loadEmbeddingModel(): Promise<EmbeddingModel> {
    loading ??= load().catch((error) => { loading = null; throw error; });
    return loading;
}

async function load(): Promise<EmbeddingModel> {
    const get = (file: string) => fetch(BASE + file).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${file}`);
        return r;
    });
    const [meta, vocabText, weights, scales] = await Promise.all([
        get("meta.json").then((r) => r.json() as Promise<{ dims: number }>),
        get("vocab.txt").then((r) => r.text()),
        get("embeddings.bin").then((r) => r.arrayBuffer()).then((b) => new Int8Array(b)),
        get("scales.bin").then((r) => r.arrayBuffer()).then((b) => new Float32Array(b)),
    ]);
    return parseModel(vocabText, weights, scales, meta.dims);
}

export const cosine = (a: Float32Array, b: Float32Array) => {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
};

// Static embeddings average every word, so question words ("what is his", "was ist sein") would drown out
// the words that carry meaning. They are removed before embedding.
const stopwords = new Set(`
a about after all also am an and any are as at be been but by can could did do does for from get got had has have
he her him his how i if in into is it its just me my of on or our she should so some than that the their them then
there these they this to us was we were what when where which who whom why will with would you your tristan ratz
aber alle als also am an auch auf aus bei bin bis bist da damit dann das dass dein deine dem den der des dich die
dir du durch ein eine einem einen einer er es etwas für gibt hab habe hat hatte ich ihm ihn ihr im in ist ja kann
kannst mich mir mit nach nicht noch nur ob oder sein seine seinem seinen seiner sich sie sind so über um und uns
von vom vor war was welche welcher welches wie wir wo woher wohin zu zum zur
`.trim().split(/\s+/));

export const isStopword = (word: string) => stopwords.has(word.toLowerCase());

export const contentWords = (text: string) => {
    const kept = text.split(/\s+/).filter((w) => !stopwords.has(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));
    return kept.length ? kept.join(" ") : text; // "where is he from" consists of stopwords only
};
