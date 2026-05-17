// Local semantic embeddings for skill descriptions.
// Uses @huggingface/transformers (the actively-maintained successor of @xenova/transformers).
// Model: all-MiniLM-L6-v2 — 384-dim sentence embeddings, ~25MB, runs offline via WASM ONNX.

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

let pipelinePromise = null;

async function loadPipeline() {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    // Disable downloading remote files to local browser/node cache messages
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    return pipeline('feature-extraction', MODEL_ID);
  })();
  return pipelinePromise;
}

export async function ensureModelLoaded() {
  await loadPipeline();
}

export async function embedText(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  const extractor = await loadPipeline();
  const out = await extractor(text.trim(), { pooling: 'mean', normalize: true });
  // out.data is Float32Array, length EMBEDDING_DIM (already L2-normalized)
  return Array.from(out.data);
}

export async function embedMany(texts) {
  const results = [];
  for (const t of texts) {
    results.push(await embedText(t));
  }
  return results;
}

// For L2-normalized vectors (which our embed output is), cosine = dot product.
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export function isValidEmbedding(v) {
  return Array.isArray(v) && v.length === EMBEDDING_DIM && v.every(x => typeof x === 'number');
}

export const MODEL_INFO = { id: MODEL_ID, dim: EMBEDDING_DIM };
