# potion-multilingual-128M (shrunk)

Static embeddings from [minishlab/potion-multilingual-128M](https://huggingface.co/minishlab/potion-multilingual-128M)
by Minish Lab, released under the MIT license.

Reduced with `scripts/build-embeddings.mjs` (40,000 most probable Latin-script tokens, PCA to 128 dimensions,
int8 quantisation with one float32 scale per row). Used by the semantic search proof of concept (`/?search=semantic`).
