// ============================================================
// Semantic search support.
//
// Turns text into a vector describing what it MEANS, so "a child is absent
// today" can match a policy phrased "child not arriving" despite sharing no
// words. Keyword matching cannot do that at any amount of tuning.
//
// Every vendor is reached through the same `embed()` call, so changing
// provider is a configuration change (EMBEDDING_PROVIDER + that vendor's key)
// and touches nothing else in the Worker.
// ============================================================

// ------------------------------------------------------------
// Providers
//
// `dims`     native output size; `reduce` means the vendor can return a
//            shorter vector on request, which keeps the stored index small.
// `secret`   name of the Worker secret holding that vendor's key. Cloudflare
//            Workers AI needs none — it runs on the account already in use.
// ------------------------------------------------------------
export const PROVIDERS = {
  openai: {
    label: "OpenAI",
    model: "text-embedding-3-small",
    dims: 1536,
    reduce: true,
    secret: "OPENAI_API_KEY",
    async embed(env, texts, { model, dims }) {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          input: texts,
          ...(dims ? { dimensions: dims } : {}),
        }),
      });
      if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  },

  // Runs inside Cloudflare on the account this Worker already uses. No API key,
  // no egress to another vendor, and the lowest latency of the options here.
  // Requires an [ai] binding in wrangler.toml.
  workersai: {
    label: "Cloudflare Workers AI",
    model: "@cf/baai/bge-base-en-v1.5",
    dims: 768,
    reduce: false,
    secret: null,
    async embed(env, texts, { model }) {
      if (!env.AI) throw new Error("Workers AI selected but no [ai] binding is configured");
      const out = await env.AI.run(model, { text: texts });
      return out.data;
    },
  },

  cohere: {
    label: "Cohere",
    model: "embed-english-v3.0",
    dims: 1024,
    reduce: false,
    secret: "COHERE_API_KEY",
    async embed(env, texts, { model, inputType }) {
      const res = await fetch("https://api.cohere.com/v1/embed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.COHERE_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          texts,
          input_type: inputType === "query" ? "search_query" : "search_document",
        }),
      });
      if (!res.ok) throw new Error(`Cohere embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()).embeddings;
    },
  },

  voyage: {
    label: "Voyage AI",
    model: "voyage-3-lite",
    dims: 512,
    reduce: false,
    secret: "VOYAGE_API_KEY",
    async embed(env, texts, { model, inputType }) {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          input: texts,
          input_type: inputType === "query" ? "query" : "document",
        }),
      });
      if (!res.ok) throw new Error(`Voyage embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  },

  gemini: {
    label: "Google Gemini",
    model: "text-embedding-004",
    dims: 768,
    reduce: true,
    secret: "GEMINI_API_KEY",
    async embed(env, texts, { model, dims }) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: texts.map((t) => ({
              model: `models/${model}`,
              content: { parts: [{ text: t }] },
              ...(dims ? { outputDimensionality: dims } : {}),
            })),
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()).embeddings.map((e) => e.values);
    },
  },
};

export const DEFAULT_PROVIDER = "openai";
export const STORED_DIMS = 512;   // what we keep on disk; smaller = faster to load

export function providerConfig(env) {
  const name = String(env?.EMBEDDING_PROVIDER || DEFAULT_PROVIDER).toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown EMBEDDING_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  const model = env?.EMBEDDING_MODEL || provider.model;
  // Only shrink when the vendor supports it; otherwise store its native size.
  const dims = provider.reduce ? Math.min(STORED_DIMS, provider.dims) : provider.dims;
  return { name, provider, model, dims };
}

export function embeddingsAvailable(env) {
  try {
    const { name, provider } = providerConfig(env);
    if (name === "workersai") return Boolean(env.AI);
    return Boolean(provider.secret && env[provider.secret]);
  } catch {
    return false;
  }
}

// `inputType` matters for Cohere and Voyage, which embed questions and
// documents differently; the others ignore it.
export async function embed(env, texts, inputType = "document") {
  const { provider, model, dims } = providerConfig(env);
  if (!texts.length) return [];
  return provider.embed(env, texts, { model, dims, inputType });
}

// ------------------------------------------------------------
// Storage
//
// Vectors are unit-normalised and quantised to one byte per dimension, which
// makes cosine similarity a plain dot product and keeps ~400 sections around
// 200KB — small enough to hold one blob in KV and cache it per isolate.
// ------------------------------------------------------------

export function normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const len = Math.sqrt(sum) || 1;
  return vec.map((v) => v / len);
}

export function quantize(vec) {
  const unit = normalize(vec);
  const out = new Int8Array(unit.length);
  for (let i = 0; i < unit.length; i++) {
    out[i] = Math.max(-127, Math.min(127, Math.round(unit[i] * 127)));
  }
  return out;
}

export function packVectors(vectors) {
  if (!vectors.length) return { dims: 0, b64: "" };
  const dims = vectors[0].length;
  const buf = new Int8Array(vectors.length * dims);
  vectors.forEach((v, i) => buf.set(quantize(v), i * dims));
  let bin = "";
  const bytes = new Uint8Array(buf.buffer);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return { dims, b64: btoa(bin) };
}

export function unpackVectors(b64, dims, count) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const all = new Int8Array(bytes.buffer);
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = all.subarray(i * dims, (i + 1) * dims);
  return out;
}

// Both sides are unit vectors, so the dot product IS the cosine similarity.
// Result lands in roughly -1..1; anything above ~0.3 is a meaningful match.
export function cosine(queryUnit, storedInt8) {
  let dot = 0;
  const n = Math.min(queryUnit.length, storedInt8.length);
  for (let i = 0; i < n; i++) dot += queryUnit[i] * storedInt8[i];
  return dot / 127;
}

// The text an entry is indexed by. Title and keywords carry most of the
// meaning; a slice of the body grounds it without drowning the rest.
export function indexText(item) {
  return [
    item.title || "",
    item.section_title || "",
    Array.isArray(item.keywords) ? item.keywords.join(", ") : (item.keywords || ""),
    String(item.content || "").slice(0, 1200),
  ].filter(Boolean).join("\n");
}

export const entryKey = (item) => `${item.type || "doc"}:${item.id}:${item.section_key || ""}`;
