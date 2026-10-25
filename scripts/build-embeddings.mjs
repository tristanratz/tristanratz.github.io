// Shrinks minishlab/potion-multilingual-128M (MIT, 500k tokens x 256 dims, 512 MB) into the few MB
// the semantic search proof of concept loads in the browser. Runs once at development time:
//
//   node scripts/build-embeddings.mjs <dir with model.safetensors + tokenizer.json> public/models/potion-multilingual [vocabSize] [dims]
//
// 1. Keeps the most probable Latin-script tokens (covers German, English and other European languages).
// 2. Reduces 256 dimensions to `dims` with PCA.
// 3. Quantises each row to int8 with one float32 scale.
import { closeSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [src, out, vocabSize = "40000", targetDims = "64"] = process.argv.slice(2);
const keep = Number(vocabSize), dims = Number(targetDims);

const tokenizer = JSON.parse(readFileSync(join(src, "tokenizer.json"), "utf8"));
const vocab = tokenizer.model.vocab; // [piece, log probability]
const minScore = vocab.reduce((min, [, s]) => Math.min(min, s), Infinity);

// Tokens added by Model2Vec beyond the original SentencePiece vocabulary all share the minimum score,
// so there is no frequency to rank them by; only original pieces are considered.
const latin = /^[\p{Script=Latin}\p{N}\p{P}\p{S}]*$/u;
const candidates = vocab
    .map(([piece, score], id) => ({ piece, score, id }))
    .filter(({ piece, score, id }) => id > 2 && score > minScore && latin.test(piece.replace(/^▁/, "")));
const single = candidates.filter(({ piece }) => piece.replace(/^▁/, "").length <= 1);
const selected = [...new Map([...single, ...candidates.sort((a, b) => b.score - a.score).slice(0, keep)]
    .map((c) => [c.id, c])).values()].sort((a, b) => b.score - a.score);

// Read only the selected rows from the 512 MB weight file.
const fd = openSync(join(src, "model.safetensors"), "r");
const lengthBytes = Buffer.alloc(8);
readSync(fd, lengthBytes, 0, 8, 0);
const headerLength = Number(lengthBytes.readBigUInt64LE());
const header = Buffer.alloc(headerLength);
readSync(fd, header, 0, headerLength, 8);
const { shape: [, fullDims], data_offsets: [start] } = JSON.parse(header.toString()).embeddings;
const rows = selected.map(({ id }) => {
    const buffer = Buffer.alloc(fullDims * 4);
    readSync(fd, buffer, 0, buffer.length, 8 + headerLength + start + id * fullDims * 4);
    return new Float32Array(buffer.buffer, buffer.byteOffset, fullDims);
});
closeSync(fd);

// PCA: covariance of the centred rows, eigenvectors via cyclic Jacobi rotations.
const mean = new Float64Array(fullDims);
rows.forEach((r) => r.forEach((v, d) => { mean[d] += v / rows.length; }));
const cov = Array.from({ length: fullDims }, () => new Float64Array(fullDims));
for (const r of rows) {
    const c = Float64Array.from(r, (v, d) => v - mean[d]);
    for (let i = 0; i < fullDims; i++) for (let j = i; j < fullDims; j++) cov[i][j] += c[i] * c[j];
}
for (let i = 0; i < fullDims; i++) for (let j = 0; j < i; j++) cov[i][j] = cov[j][i];

const vectors = Array.from({ length: fullDims }, (_, i) => Float64Array.from({ length: fullDims }, (_, j) => (i === j ? 1 : 0)));
for (let sweep = 0; sweep < 12; sweep++) {
    for (let p = 0; p < fullDims; p++) for (let q = p + 1; q < fullDims; q++) {
        if (Math.abs(cov[p][q]) < 1e-12) continue;
        const theta = (cov[q][q] - cov[p][p]) / (2 * cov[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < fullDims; k++) {
            const a = cov[k][p], b = cov[k][q];
            cov[k][p] = c * a - s * b;
            cov[k][q] = s * a + c * b;
        }
        for (let k = 0; k < fullDims; k++) {
            const a = cov[p][k], b = cov[q][k];
            cov[p][k] = c * a - s * b;
            cov[q][k] = s * a + c * b;
        }
        for (let k = 0; k < fullDims; k++) {
            const a = vectors[k][p], b = vectors[k][q];
            vectors[k][p] = c * a - s * b;
            vectors[k][q] = s * a + c * b;
        }
    }
}
const components = Array.from({ length: fullDims }, (_, i) => i)
    .sort((a, b) => cov[b][b] - cov[a][a])
    .slice(0, dims)
    .map((i) => Float64Array.from({ length: fullDims }, (_, k) => vectors[k][i]));

// Project and quantise.
const weights = new Int8Array(selected.length * dims);
const scales = new Float32Array(selected.length);
rows.forEach((r, i) => {
    const projected = components.map((component) => component.reduce((sum, w, d) => sum + w * (r[d] - mean[d]), 0));
    const scale = Math.max(...projected.map(Math.abs)) / 127 || 1;
    scales[i] = scale;
    projected.forEach((v, d) => { weights[i * dims + d] = Math.round(v / scale); });
});

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "vocab.txt"), selected.map(({ piece, score }) => `${piece}\t${score.toFixed(2)}`).join("\n") + "\n");
writeFileSync(join(out, "embeddings.bin"), weights);
writeFileSync(join(out, "scales.bin"), Buffer.from(scales.buffer));
writeFileSync(join(out, "meta.json"), JSON.stringify({
    source: "minishlab/potion-multilingual-128M", license: "MIT", tokens: selected.length, dims,
}));
console.log(`${selected.length} tokens x ${dims} dims -> ${out}`);
