// ============================================================
// CMS Assistant v2 — Cloudflare Worker
// ------------------------------------------------------------
// Second-generation backend over the SAME content as v1.
// It binds the existing content namespaces READ-ONLY and keeps
// its own sessions/logs namespace, so v1 is completely unaffected.
//
// KV bindings (see wrangler.toml):
//   POLICIES    -> cms_policies    (shared, read-only)
//   PROTOCOLS   -> cms_protocols   (shared, read-only)
//   HANDBOOKS   -> cms_handbooks   (shared, read-only)
//   STATE       -> cms_v2_state    (v2 ONLY: tokens, rate limits, cache, logs)
//
// Secrets:
//   STAFF_CODE, PARENT_CODE, ADMIN_PIN, OPENAI_API_KEY
// Vars:
//   OPENAI_MODEL (default gpt-4o-mini), ALLOWED_ORIGINS (default "*")
//
// Improvements over v1 (see README "What changed"):
//   1. /doc is role-checked — parents can no longer read policies
//   2. /admin/stats returns ok:true + ok_count (no duplicate key)
//   3. Index-first ranking — loads ~8 docs, not all 30
//   4. Handbook sections rank individually, not as one blob
//   5. /admin/logs reads list metadata — 1 KV op instead of ~200
//   6. WC/WD campus aliasing
// ============================================================

const VERSION = "2.0.0";
const SERVICE = "cms-assistant-v2";

const TOKEN_TTL = 60 * 60 * 8;          // 8 hours
const LOG_TTL = 60 * 60 * 24 * 30;      // 30 days
import {
  embed, embeddingsAvailable, providerConfig, normalize, cosine,
  packVectors, unpackVectors, indexText, entryKey, PROVIDERS,
} from "./lib/embeddings.js";

const AI_CACHE_TTL = 60 * 5;            // 5 minutes
const DOC_CACHE_MS = 60 * 1000;         // in-isolate
const MAX_DOCS_TO_AI = 12;
// When semantic search is on, the keyword pass must hand over a wider pool,
// or it would discard the very documents meaning-matching exists to rescue.
const SHORTLIST_POOL = 40;
const SEMANTIC_INDEX_KEY = "emb:index:v1";
const MAX_CHARS_PER_DOC = 4000;

const RATE_AUTH = { limit: 10, window: 60 };
const RATE_API = { limit: 60, window: 60 };

const PROGRAMS = ["ALL", "PRESCHOOL", "SR_CASA", "ELEMENTARY"];

// The UI uses WC for Willowdale; some data uses WD. Accept either.
const CAMPUS_ALIASES = { WC: ["WC", "WD"], WD: ["WD", "WC"] };

// ============================================================
// HTTP helpers
// ============================================================

function cors(request, env) {
  const allowed = String(env?.ALLOWED_ORIGINS || "*").trim();
  const origin = request.headers.get("Origin") || "";

  let allowOrigin = "*";
  if (allowed !== "*") {
    const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
    allowOrigin = list.includes(origin) ? origin : list[0] || "*";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors(request, env),
    },
  });
}

function fail(error, status, request, env) {
  return json({ ok: false, error }, status || 400, request, env);
}

function tooMany(retryAfter, request, env) {
  return new Response(
    JSON.stringify({ ok: false, error: "Too many requests. Please wait a moment and try again." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(Math.max(1, retryAfter || 1)),
        ...cors(request, env),
      },
    }
  );
}

// Accepts { x }, { data:{ x } } and { data:{ data:{ x } } }, matching v1's tolerance.
async function readBody(request) {
  let raw;
  try {
    raw = await request.json();
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return {};

  let out = raw;
  for (let depth = 0; depth < 2; depth++) {
    if (out.data && typeof out.data === "object") {
      const { data, ...rest } = out;
      out = { ...data, ...rest };
    } else break;
  }
  return out;
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function textOf(x) {
  if (x == null) return "";
  if (Array.isArray(x)) return x.join("\n");
  return String(x);
}

function clamp(text, max) {
  const s = String(text || "");
  return s.length > max ? s.slice(0, max) + "\n…[truncated]" : s;
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normCampus(v) {
  return String(v || "").trim().toUpperCase();
}

function normProgram(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s || s === "all" || s === "all programs" || s === "all_programs") return "ALL";
  if (s.includes("preschool")) return "PRESCHOOL";
  if (s.includes("casa") || s.startsWith("sr")) return "SR_CASA";
  if (s.includes("elementary")) return "ELEMENTARY";
  const up = s.toUpperCase();
  return PROGRAMS.includes(up) ? up : "ALL";
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// In-isolate cache
// ============================================================

function cache() {
  if (!globalThis.__CMS_V2_CACHE) globalThis.__CMS_V2_CACHE = new Map();
  return globalThis.__CMS_V2_CACHE;
}

function cacheGet(key) {
  const hit = cache().get(key);
  if (!hit) return null;
  if (Date.now() > hit.until) {
    cache().delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value, ttlMs) {
  cache().set(key, { value, until: Date.now() + (ttlMs || DOC_CACHE_MS) });
  return value;
}

// ============================================================
// Auth & rate limiting  (all writes go to STATE, never the shared namespaces)
// ============================================================

async function issueToken(env, role) {
  const token = crypto.randomUUID();
  await env.STATE.put(
    `${role}:${token}`,
    JSON.stringify({ role, created: Date.now() }),
    { expirationTtl: TOKEN_TTL }
  );
  return token;
}

function bearer(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

// Only checks the roles a route actually allows — this is what closes
// v1's /doc gap, where any valid token (including a parent's) was accepted.
async function authenticate(request, env, allowedRoles) {
  const token = bearer(request);
  if (!token) return { ok: false, error: "Unauthorized (token required)" };

  for (const role of allowedRoles) {
    if (await env.STATE.get(`${role}:${token}`)) {
      return { ok: true, role, token };
    }
  }
  return { ok: false, error: "Unauthorized (invalid, expired, or wrong role for this resource)" };
}

async function rateLimit(env, key, { limit, window }) {
  const now = Date.now();
  const windowId = Math.floor(now / (window * 1000));
  const bucketKey = `rl:${key}:${windowId}`;

  const count = parseInt((await env.STATE.get(bucketKey)) || "0", 10) || 0;
  if (count >= limit) {
    return { ok: false, retry_after: window - Math.floor((now / 1000) % window) };
  }

  await env.STATE.put(bucketKey, String(count + 1), { expirationTtl: window + 5 });
  return { ok: true };
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

// ============================================================
// Content loading — READ-ONLY against the shared namespaces
// ============================================================

function coerceIndex(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.policies)) return value.policies;
  if (value && Array.isArray(value.protocols)) return value.protocols;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

function nsFor(env, kind) {
  return kind === "policy" ? env.POLICIES : env.PROTOCOLS;
}

async function loadIndex(env, kind) {
  const key = `index:${kind}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const ns = nsFor(env, kind);
  if (!ns) return cacheSet(key, []);

  const raw = await ns.get(kind === "policy" ? "policies" : "protocols");
  const list = coerceIndex(safeParse(raw, []))
    .map((e) => ({
      id: String(e?.id || e?.kv_key || "").trim(),
      kv_key: String(e?.kv_key || e?.id || "").trim(),
      type: kind,
      title: String(e?.title || e?.id || ""),
      keywords: Array.isArray(e?.keywords) ? e.keywords : [],
      program: e?.program ? normProgram(e.program) : null,
      link: typeof e?.link === "string" ? e.link : null,
    }))
    .filter((e) => e.id && e.kv_key);

  return cacheSet(key, list);
}

async function loadDoc(env, kind, id) {
  const key = `doc:${kind}:${id}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const ns = nsFor(env, kind);
  if (!ns) return null;

  const index = await loadIndex(env, kind);
  const meta = index.find((e) => e.id === id || e.kv_key === id);
  if (!meta) return null;

  const full = safeParse(await ns.get(meta.kv_key), null);

  return cacheSet(key, {
    id: full?.id || meta.id,
    type: full?.type || meta.type || kind,
    title: full?.title || meta.title || meta.kv_key,
    content: textOf(full?.content),
    keywords: Array.isArray(full?.keywords) ? full.keywords : meta.keywords,
    program: full?.program ? normProgram(full.program) : meta.program,
    link: typeof full?.link === "string" ? full.link : meta.link,
  });
}

async function loadHandbooks(env, campus) {
  const c = normCampus(campus);
  const key = `handbooks:${c}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  if (!env.HANDBOOKS) return cacheSet(key, []);

  let list = [];
  for (const code of CAMPUS_ALIASES[c] || [c]) {
    const raw = await env.HANDBOOKS.get(`handbook_${code}`);
    const parsed = safeParse(raw, null);
    if (parsed) {
      list = Array.isArray(parsed) ? parsed : [parsed];
      break;
    }
  }

  const normalized = list.map((hb, i) => ({
    id: String(hb?.id || `${c.toLowerCase()}_handbook_${i}`),
    type: "handbook",
    campus: normCampus(hb?.campus || c),
    program: hb?.program ? normProgram(hb.program) : "ALL",
    title: String(hb?.title || "Parent Handbook"),
    link: typeof hb?.link === "string" ? hb.link : null,
    keywords: Array.isArray(hb?.keywords) ? hb.keywords : ["handbook", "parent handbook"],
    sections: (Array.isArray(hb?.sections) ? hb.sections : []).map((s, j) => ({
      key: String(s?.key || `section_${j}`),
      title: String(s?.title || s?.key || `Section ${j + 1}`),
      content: textOf(s?.content),
    })),
  }));

  return cacheSet(key, normalized);
}

function programMatches(docProgram, requested) {
  const d = normProgram(docProgram || "ALL");
  const r = normProgram(requested);
  return r === "ALL" || d === "ALL" || d === r;
}

// ============================================================
// Ranking
// ============================================================

// Words with no topical meaning. Negations are deliberately NOT listed:
// several keyword phrases are built on them ("child not arriving", "child not
// picked up"), and discarding "not" was what made "did not show up" unfindable.
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "you", "your", "our", "with", "what",
  "when", "where", "how", "why", "can", "does", "did", "should", "would", "could",
  "this", "that", "there", "from", "have", "has", "had", "was", "were", "who",
  "a", "an", "of", "to", "in", "on", "is", "it", "at", "be", "do", "if", "or", "we",
  "i", "my", "me", "us", "am", "so", "as", "by", "will", "shall", "please", "tell",
]);

// Everyday phrasing mapped onto the vocabulary the documents actually use.
// Staff ask "didn't show up"; the Safe Arrival policy says "child not arriving".
const SYNONYMS = new Map(Object.entries({
  show: ["arrive", "arriving", "arrival", "attend", "attendance"],
  come: ["arrive", "arriving", "arrival", "attend", "attendance"],
  came: ["arrive", "arriving", "arrival", "attendance"],
  coming: ["arrive", "arriving", "arrival", "attendance"],
  school: ["attendance", "arrival"],
  turn: ["arrive", "arriving"],
  arrived: ["arrival", "arriving"],
  showed: ["arrive", "arriving", "arrival"],
  shows: ["arrive", "arriving", "arrival"],
  absent: ["arrival", "arriving", "attendance"],
  missing: ["arrival", "arriving"],
  late: ["lateness", "arrival", "dismissal"],
  pickup: ["pick", "dismissal", "picked"],
  picked: ["dismissal", "pick"],
  collect: ["pick", "dismissal"],
  waitlist: ["waiting", "list"],
  tylenol: ["medication", "acetaminophen", "counter"],
  advil: ["medication", "ibuprofen", "counter"],
  epipen: ["epinephrine", "anaphylaxis"],
  allergy: ["anaphylaxis", "allergic"],
  phone: ["cell", "mobile", "device"],
  complaint: ["concerns", "issues", "complaints"],
  complain: ["concerns", "issues", "complaints"],
  lockdown: ["emergency", "secure"],
  evacuate: ["evacuation", "fire", "emergency"],
  nap: ["sleep", "rest"],
  napping: ["sleep", "rest"],
  teacher: ["staff", "educator", "classroom"],
  birthday: ["birthdays", "celebration"],
  sick: ["illness", "ill", "health"],
  covid: ["illness", "outbreak", "infection"],
}));

// Contractions must be expanded BEFORE punctuation is stripped. Otherwise
// "didn't" becomes "didn" + "t" and the negation vanishes — and the negation
// is usually the most discriminating word in the question.
const CONTRACTIONS = [
  [/\b(can)(?:'|\u2019)?t\b/g, "can not"],
  [/\b(won)(?:'|\u2019)?t\b/g, "will not"],
  [/\b(shan)(?:'|\u2019)?t\b/g, "shall not"],
  [/\b(\w+?)n(?:'|\u2019)?t\b/g, "$1 not"],   // didn't, doesn't, isn't, aren't, hasn't
  [/(?:'|\u2019)re\b/g, " are"],
  [/(?:'|\u2019)ve\b/g, " have"],
  [/(?:'|\u2019)ll\b/g, " will"],
  [/(?:'|\u2019)m\b/g, " am"],
  [/(?:'|\u2019)s\b/g, ""],
];

const norm = (t) => {
  let s = String(t || "").toLowerCase();
  for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  return s.replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
};

const wordsOf = (t) => norm(t).split(" ").filter(Boolean);

// Query words worth matching on, plus their document-vocabulary synonyms.
function tokenize(text) {
  const out = [];
  for (const w of wordsOf(text)) {
    if (w.length < 2 || STOP_WORDS.has(w)) continue;
    out.push(w);
    for (const s of SYNONYMS.get(w) || []) out.push(...wordsOf(s));
  }
  return [...new Set(out)];
}

// Damerau-Levenshtein, abandoned as soon as the distance exceeds `max`.
// Transpositions cost one edit, so "fier" -> "fire" is distance 1.
function editDistance(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = [], prev = [], cur = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j++) { prev2[j] = prev[j]; prev[j] = cur[j]; }
  }
  return prev[b.length];
}

// How well one query word matches one document word: 1 exact, 0 not at all.
// Tolerant enough for real typing ("achild", "medicaton", "polcy").
function wordSim(q, d) {
  if (q === d) return 1;
  if (q.length < 3 || d.length < 3) return 0;
  const shorter = q.length < d.length ? q : d;
  const longer = q.length < d.length ? d : q;
  if (longer.includes(shorter) && shorter.length >= 4) return 0.8;
  const tol = longer.length >= 8 ? 2 : longer.length >= 4 ? 1 : 0;
  if (tol) {
    const dist = editDistance(q, d, tol);
    if (dist <= tol) return dist === 1 ? 0.85 : 0.7;
  }
  let p = 0;
  while (p < shorter.length && q[p] === d[p]) p++;
  if (p >= 4 && shorter.length >= 5) return 0.55;
  return 0;
}

function bestSim(word, pool) {
  let best = 0;
  for (const p of pool) {
    const s = wordSim(word, p);
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}

// Per-document derived text, memoized. loadDoc hands back the same object for
// the life of the isolate, so this is computed once per document, not per query.
const PREP = new WeakMap();

function prepare(item) {
  let prep = PREP.get(item);
  if (prep) return prep;
  const raw = Array.isArray(item.keywords)
    ? item.keywords
    : (item.keywords ? [item.keywords] : []);
  // Some documents pack every keyword into a single comma-joined string.
  const phrases = raw.flatMap((k) => String(k).split(",")).map(norm).filter(Boolean);
  prep = {
    phrases: phrases.map((p) => ({ text: p, words: wordsOf(p) })),
    kwWords: new Set(phrases.flatMap(wordsOf)),
    titleWords: wordsOf(item.title),
    sectionWords: wordsOf(item.section_title),
    // Body text only contributes a capped bonus, so indexing the whole of a
    // long policy buys nothing and costs CPU on the first query in an isolate.
    contentWords: new Set(wordsOf(item.content).slice(0, 1500)),
    titleText: norm(item.title),
    sectionText: norm(item.section_title),
  };
  if (typeof item === "object" && item !== null) PREP.set(item, prep);
  return prep;
}

function score(item, tokens, rawQuery, idf) {
  const p = prepare(item);
  const w = idf || (() => 1);
  const qNorm = norm(rawQuery);
  const pool = tokens.length ? tokens : wordsOf(rawQuery);
  let s = 0;

  // 1. Keyword phrases are the most specific signal a document carries.
  //    Partial credit is the point: "child not arriving" must score well for
  //    "a child did not show up", where "arriving" is never actually said.
  for (const ph of p.phrases) {
    if (!ph.words.length) continue;
    // Weight each word of the phrase by how rare it is in this corpus, so a
    // shared "not" or "child" cannot carry a phrase on its own while a rare
    // word like "anaphylaxis" is what actually identifies the document.
    let covered = 0, total = 0;
    for (const pw of ph.words) {
      const weight = w(pw);
      total += weight;
      covered += bestSim(pw, pool) * weight;
    }
    const frac = total > 0 ? covered / total : 0;
    if (frac >= 0.5) s += 16 * frac * (ph.words.length >= 2 ? 1 : 0.5);
    if (ph.words.length >= 2 && qNorm.includes(ph.text)) s += 10;
  }

  // 2. Titles.
  for (const t of tokens) {
    const weight = w(t);
    s += 5 * bestSim(t, p.titleWords) * weight;
    s += 3 * bestSim(t, p.sectionWords) * weight;
    if (p.kwWords.size) s += 4 * bestSim(t, p.kwWords) * weight;
  }

  // 3. Body text, capped so long documents cannot win on length alone.
  let body = 0;
  for (const t of tokens) if (p.contentWords.has(t)) body += w(t);
  s += Math.min(body, 4);

  // 4. The whole question appearing verbatim in a heading.
  if (qNorm.length > 6) {
    if (p.titleText.includes(qNorm)) s += 12;
    if (p.sectionText.includes(qNorm)) s += 10;
  }
  return s;
}

// How informative each word is across the candidate set. Words appearing in
// many documents ("child", "not", "policy") identify nothing; rare ones do.
function buildIdf(items) {
  const df = new Map();
  for (const item of items) {
    const p = prepare(item);
    const seen = new Set([...p.kwWords, ...p.titleWords, ...p.sectionWords]);
    for (const word of seen) df.set(word, (df.get(word) || 0) + 1);
  }
  const n = Math.max(items.length, 1);
  const cache = new Map();
  return (word) => {
    let v = cache.get(word);
    if (v !== undefined) return v;
    // Ranges from ~1 for a word unique to one document down towards ~0.15 for
    // one present in nearly all of them. Never zero: a common word still counts
    // for something when it is all the question gives us.
    v = Math.max(0.15, Math.log(1 + n / (1 + (df.get(word) || 0))) / Math.log(1 + n));
    cache.set(word, v);
    return v;
  };
}

function rank(items, query, limit, semantic) {
  const tokens = tokenize(query);
  const idf = buildIdf(items);
  const lexical = items.map((c, i) => ({ i, s: score(c, tokens, query, idf) }));

  if (!semantic) {
    const scored = items
      .map((c, i) => ({ ...c, _score: lexical[i].s }))
      .sort((a, b) => b._score - a._score);
    const matched = scored.filter((c) => c._score > 0);
    return (matched.length ? matched : scored).slice(0, limit || MAX_DOCS_TO_AI);
  }

  // Two rankings — one on words, one on meaning — combined by reciprocal rank
  // fusion. Fusing positions rather than raw scores means the two never have
  // to be put on a comparable scale, which is what makes hybrid search stable.
  const meaning = items.map((c, i) => ({ i, s: semantic.similarity(c) }));
  const order = (list) =>
    list.filter((x) => x.s !== null)
        .sort((a, b) => b.s - a.s)
        .reduce((m, x, pos) => m.set(x.i, pos + 1), new Map());

  const lexRank = order(lexical);
  const semRank = order(meaning);
  const K = 20;

  const fused = items.map((c, i) => {
    const lr = lexRank.get(i);
    const sr = semRank.get(i);
    let s = 0;
    // Words and meaning contribute equally. Weighting meaning above words was
    // measurably worse: it demoted exact matches ("anaphylaxis", "fire drill")
    // that the keyword pass had already ranked first, without finding anything
    // the pair did not already find together.
    if (lr) s += 1 / (K + lr);
    if (sr) s += 1 / (K + sr);
    return { ...c, _score: s, _lex: lexical[i].s, _sem: meaning[i].s };
  }).sort((a, b) => b._score - a._score);

  const matched = fused.filter((c) => c._score > 0);
  return (matched.length ? matched : fused).slice(0, limit || MAX_DOCS_TO_AI);
}

// ------------------------------------------------------------
// Semantic index: one blob of quantised vectors in STATE, loaded
// once per isolate. Rebuilt via POST /admin/reindex.
// ------------------------------------------------------------

async function loadSemanticIndex(env) {
  // cacheGet returns null for "not cached", so the entry is wrapped: a present
  // wrapper whose .index is null means "checked, there is no usable index",
  // which must not be confused with "not looked yet".
  const cached = cacheGet(SEMANTIC_INDEX_KEY);
  if (cached) return cached.index;

  let index = null;
  try {
    const raw = await env.STATE.get(SEMANTIC_INDEX_KEY);
    if (raw) {
      const meta = JSON.parse(raw);
      const cfg = providerConfig(env);
      // Vectors from different providers or models are not comparable. Rather
      // than return nonsense, ignore a stale index and fall back to keywords.
      if (meta.provider === cfg.name && meta.model === cfg.model && meta.dims === cfg.dims) {
        index = {
          dims: meta.dims,
          vectors: unpackVectors(meta.b64, meta.dims, meta.keys.length),
          pos: new Map(meta.keys.map((k, i) => [k, i])),
        };
      }
    }
  } catch {
    index = null;
  }
  return cacheSet(SEMANTIC_INDEX_KEY, { index }, 10 * 60 * 1000).index;
}

async function buildSemantic(env, query, report) {
  const off = (why) => { if (report) report.why = why; return null; };

  if (!embeddingsAvailable(env)) return off("no embedding credentials configured");
  let index;
  try {
    index = await loadSemanticIndex(env);
  } catch (e) {
    return off(`index load failed: ${e.message}`);
  }
  if (!index) return off("no index stored, or it was built by a different provider/model — run POST /admin/reindex");

  let queryUnit;
  try {
    const [vec] = await embed(env, [query], "query");
    if (!vec) return off("provider returned no vector");
    if (vec.length !== index.dims) return off(`provider returned ${vec.length} dimensions, index has ${index.dims}`);
    queryUnit = normalize(vec);
  } catch (e) {
    return off(`embedding call failed: ${e.message}`);   // never take the assistant down
  }

  return {
    similarity(item) {
      const pos = index.pos.get(entryKey(item));
      if (pos === undefined) return null;
      return cosine(queryUnit, index.vectors[pos]);
    },
  };
}

// Index-first: the index carries title + keywords, the two heaviest signals,
// so shortlist on it and only then fetch bodies — in parallel.
// v1 expanded every policy and protocol on each cold request (~30 serial reads).
async function shortlistDocs(env, kind, { query, program, scope, semantic }) {
  if (scope?.id) {
    const doc = await loadDoc(env, kind, scope.id);
    return doc && programMatches(doc.program, program) ? [doc] : [];
  }

  const index = (await loadIndex(env, kind)).filter((e) => programMatches(e.program, program));
  if (!index.length) return [];

  // Ranking on the index only works if the index carries keywords, which are
  // the heaviest signal (x6, vs x4 for title). Some data sets keep keywords
  // on the documents but not in the index — there, shortlisting on title
  // alone would discard the best matches, so load everything and rank in
  // full instead. loadDoc memoizes per isolate, so this costs one pass per
  // cold isolate rather than one per request, and runs in parallel.
  const indexHasKeywords = index.some((e) => Array.isArray(e.keywords) && e.keywords.length);

  const pool = semantic ? SHORTLIST_POOL : MAX_DOCS_TO_AI;
  const entries = indexHasKeywords ? rank(index, query, pool) : index;
  const docs = (await Promise.all(entries.map((e) => loadDoc(env, kind, e.id))))
    .filter((d) => d && programMatches(d.program, program));

  return indexHasKeywords ? docs : rank(docs, query, pool, semantic);
}

// Each handbook SECTION is its own candidate. v1 concatenated every section
// into one blob, so a large handbook crowded out everything else.
async function buildCandidates(env, { role, campus, program, scope, query, semantic }) {
  const type = scope?.type ? String(scope.type).toLowerCase() : null;

  const wantPolicies = role === "staff" && (!type || type === "policy");
  const wantProtocols = role === "staff" && (!type || type === "protocol");
  const wantHandbooks = !type || type === "handbook";

  const [policies, protocols] = await Promise.all([
    wantPolicies ? shortlistDocs(env, "policy", { query, program, scope, semantic }) : [],
    wantProtocols ? shortlistDocs(env, "protocol", { query, program, scope, semantic }) : [],
  ]);

  const out = [];

  for (const d of [...policies, ...protocols]) {
    out.push({
      id: d.id,
      type: d.type,
      title: d.title,
      program: d.program,
      link: d.link,
      keywords: d.keywords,
      section_key: null,
      section_title: null,
      content: d.content,
    });
  }

  if (wantHandbooks) {
    for (const hb of await loadHandbooks(env, campus)) {
      if (scope?.id && hb.id !== scope.id) continue;
      if (!programMatches(hb.program, program)) continue;

      for (const sec of hb.sections) {
        if (scope?.section_key && sec.key !== scope.section_key) continue;
        out.push({
          id: hb.id,
          type: "handbook",
          title: hb.title,
          program: hb.program,
          link: hb.link,
          keywords: [...hb.keywords, sec.title],
          section_key: sec.key,
          section_title: sec.title,
          content: sec.content,
        });
      }
    }
  }

  return out;
}

// ============================================================
// OpenAI
// ============================================================

const SYSTEM_PROMPT = `You are the Central Montessori School (CMS) assistant.
Answer questions from school STAFF and PARENTS using ONLY the documents provided below.

Rules:
- Use ONLY the provided documents. Never invent policies, numbers, or procedures.
- If the documents don't answer it, set "id" to null and say briefly what's missing.
- If a scope is given, answer ONLY from that document or section.
- Never give legal advice. Never reveal internal staff-only policies to a parent.
- Be practical and concrete: plain language, actionable steps.
- If the answer comes from a handbook section, return that exact section_key.

Return valid JSON only. No markdown, no backticks. Exactly:
{"id":"best_doc_id_or_null","answer":"clear helpful answer","match_reason":"short reason","section_key":"best_section_key_or_null"}`;

function buildPrompt({ query, campus, program, role, scope, docs }) {
  const blocks = docs.map((d, i) => {
    const lines = [
      `--- Document ${i + 1} ---`,
      `ID: ${d.id}`,
      `Type: ${d.type}`,
      `Title: ${d.title}`,
    ];
    if (d.section_key) {
      lines.push(`Section key: ${d.section_key}`);
      lines.push(`Section title: ${d.section_title || ""}`);
    }
    if (d.keywords?.length) lines.push(`Keywords: ${d.keywords.join(", ")}`);
    lines.push("Text:");
    lines.push(clamp(d.content, MAX_CHARS_PER_DOC));
    return lines.join("\n");
  });

  return [
    `Campus: ${campus}`,
    `Program: ${program}`,
    `Asked by role: ${role}`,
    scope ? `Scope restriction: ${JSON.stringify(scope)}` : "",
    "",
    "Documents:",
    blocks.join("\n\n"),
    "",
    `Question: ${query}`,
  ].filter(Boolean).join("\n");
}

async function askOpenAI(env, prompt) {
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY is not configured" };

  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (e) {
    console.error("OpenAI request failed:", e?.message || String(e));
    return { ok: false, error: `OpenAI request failed: ${e?.message || e}` };
  }

  if (!res.ok) {
    console.error(`OpenAI returned ${res.status}`);
    return { ok: false, error: `OpenAI error ${res.status}` };
  }

  const data = await res.json().catch(() => null);
  const parsed = safeParse(data?.choices?.[0]?.message?.content || "", null);
  if (!parsed || typeof parsed !== "object") {
    console.error("OpenAI returned non-JSON content");
    return { ok: false, error: "AI returned non-JSON" };
  }

  const clean = (v) => (v && v !== "null" ? String(v) : null);
  return {
    ok: true,
    id: clean(parsed.id),
    answer: String(parsed.answer || "").trim(),
    match_reason: String(parsed.match_reason || "").trim(),
    section_key: clean(parsed.section_key),
  };
}

// ============================================================
// Logging  (v2's own namespace — v1's dashboard never sees these)
// ============================================================

// Inverted timestamp keeps KV's ascending list order newest-first, and the
// record is duplicated into list metadata so /admin/logs needs no value reads.
// v1 fetched every log value individually (~200 KV reads per dashboard load).
let logSequence = 0;

async function writeLog(env, record) {
  try {
    const ts = Number(record.ts || Date.now());
    // Two logs can land in the same millisecond, which would leave their
    // order arbitrary. A per-isolate sequence (also inverted) breaks the tie
    // so "newest first" holds at sub-millisecond resolution too.
    const seq = String(999999 - (logSequence++ % 1000000)).padStart(6, "0");
    const key = `log:${String(1e15 - ts).padStart(16, "0")}:${seq}:${randomId().slice(0, 8)}`;

    const metadata = {
      ts,
      campus: record.campus || "UNKNOWN",
      user_role: record.user_role || "unknown",
      ok: record.ok === true,
      ms: Number(record.ms || 0),
      source_type: record.source_type || null,
      source_id: record.source_id || null,
      source_title: clamp(record.source_title || "", 120) || null,
      section_key: record.section_key || null,
      query: clamp(record.query || "", 180),
      cached: record.cached === true,
    };

    await env.STATE.put(key, JSON.stringify({ ...record, ts }), {
      expirationTtl: LOG_TTL,
      metadata,
    });
  } catch (err) {
    // Logging must never break a user request, but a silent failure means the
    // admin dashboard just goes empty with no explanation — so surface it.
    console.error("writeLog failed:", err?.message || String(err));
  }
}

async function readLogs(env, limit) {
  const capped = clampInt(limit, 1, 1000, 200);
  const out = [];
  let cursor;

  while (out.length < capped) {
    const page = await env.STATE.list({
      prefix: "log:",
      limit: Math.min(1000, capped - out.length),
      cursor,
    });

    for (const k of page.keys) {
      if (k.metadata) out.push(k.metadata);
      else {
        const raw = await env.STATE.get(k.name);
        const parsed = safeParse(raw, null);
        if (parsed) out.push(parsed);
      }
    }

    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }

  // Stable sort: equal timestamps keep KV key order, which is already
  // newest-first thanks to the inverted timestamp + sequence in the key.
  out.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  return out.slice(0, capped);
}

// ============================================================
// Routes
// ============================================================

async function handleAuth(request, env, role) {
  const rl = await rateLimit(env, `auth_${role}:${clientIp(request)}`, RATE_AUTH);
  if (!rl.ok) return tooMany(rl.retry_after, request, env);

  const body = await readBody(request);
  if (body === null) return fail("Invalid JSON", 400, request, env);

  const field = role === "admin" ? "pin" : "code";
  const supplied = String(body[field] || "").trim();
  if (!supplied) return fail(`Missing ${field}`, 400, request, env);

  const envName = role === "staff" ? "STAFF_CODE" : role === "parent" ? "PARENT_CODE" : "ADMIN_PIN";
  const expected = String(env[envName] || "").trim();
  if (!expected) return fail(`${envName} not set`, 500, request, env);

  if (supplied !== expected) {
    return fail(role === "admin" ? "Invalid admin PIN" : "Invalid code", 401, request, env);
  }

  const token = await issueToken(env, role);
  return json({ ok: true, token, expires_in: TOKEN_TTL, role }, 200, request, env);
}

async function handleHandbooks(request, env, url) {
  const auth = await authenticate(request, env, ["staff", "parent", "admin"]);
  if (!auth.ok) return fail(auth.error, 401, request, env);

  const campus = normCampus(url.searchParams.get("campus"));
  if (!campus) return fail("Missing campus", 400, request, env);

  const handbooks = await loadHandbooks(env, campus);
  const id = String(url.searchParams.get("id") || "").trim();
  const sectionKey = String(url.searchParams.get("section") || "").trim();

  if (!id) {
    return json({
      ok: true,
      campus,
      count: handbooks.length,
      handbooks: handbooks.map((hb) => ({
        id: hb.id,
        type: hb.type,
        campus: hb.campus,
        program: hb.program,
        title: hb.title,
        link: hb.link,
        sections: hb.sections.map((s) => ({ key: s.key, title: s.title })),
      })),
    }, 200, request, env);
  }

  const hb = handbooks.find((x) => x.id === id);
  if (!hb) return fail("Handbook not found", 404, request, env);

  const meta = { id: hb.id, type: hb.type, title: hb.title, program: hb.program, link: hb.link, campus: hb.campus };

  if (!sectionKey) {
    return json({ ok: true, campus, handbook: { ...meta, sections: hb.sections } }, 200, request, env);
  }

  const section = hb.sections.find((s) => s.key === sectionKey);
  if (!section) return fail("Section not found", 404, request, env);

  return json({ ok: true, campus, handbook: meta, section }, 200, request, env);
}

// Staff and admin only. v1 accepted any valid token here, so a parent could
// read internal policies directly from the endpoint.
async function handleDoc(request, env, url) {
  const auth = await authenticate(request, env, ["staff", "admin"]);
  if (!auth.ok) {
    return fail("Unauthorized (staff or admin token required)", 401, request, env);
  }

  const type = String(url.searchParams.get("type") || "").trim().toLowerCase();
  const id = String(url.searchParams.get("id") || "").trim();

  if (type !== "policy" && type !== "protocol") return fail("Invalid type", 400, request, env);
  if (!id) return fail("Missing id", 400, request, env);

  const doc = await loadDoc(env, type, id);
  if (!doc) return fail("Document not found", 404, request, env);

  return json({ ok: true, doc }, 200, request, env);
}

async function handleApi(request, env, ctx) {
  const started = Date.now();

  const auth = await authenticate(request, env, ["staff", "parent"]);
  if (!auth.ok) return fail("Unauthorized (staff/parent token required)", 401, request, env);

  const rl = await rateLimit(env, `api:${auth.token}`, RATE_API);
  if (!rl.ok) return tooMany(rl.retry_after, request, env);

  const body = await readBody(request);
  if (body === null) return fail("Invalid JSON", 400, request, env);

  const query = String(body.query || "").trim();
  const campus = normCampus(body.campus);
  const program = normProgram(body.program);
  const scope = body.scope && typeof body.scope === "object" ? body.scope : null;

  if (!campus) return fail("Missing campus", 400, request, env);
  if (!query) return fail("Missing query", 400, request, env);

  // Parents are restricted to handbook content regardless of the scope sent.
  if (auth.role === "parent" && scope?.type && String(scope.type).toLowerCase() !== "handbook") {
    return fail("Parents can only access the Parent Handbook.", 403, request, env);
  }

  const cacheKey = `ai:${auth.role}:${campus}:${program}:${await sha256Hex(
    query.toLowerCase() + JSON.stringify(scope || {})
  )}`;

  const cached = safeParse(await env.STATE.get(cacheKey), null);
  if (cached) {
    ctx.waitUntil(writeLog(env, {
      campus, user_role: auth.role, ok: true, ms: Date.now() - started, cached: true, query,
      source_type: cached.source?.type || null,
      source_id: cached.source?.id || null,
      source_title: cached.source?.title || null,
      section_key: cached.handbook_section?.section_key || null,
    }));
    return json({ ...cached, cached: true }, 200, request, env);
  }

  // Meaning-based matching, when an index exists. Falls back to keywords alone
  // if it is missing, stale, or the embedding call fails.
  const semantic = await buildSemantic(env, query);

  const candidates = await buildCandidates(env, {
    role: auth.role, campus, program, scope, query, semantic,
  });

  if (!candidates.length) {
    ctx.waitUntil(writeLog(env, {
      campus, user_role: auth.role, ok: false, ms: Date.now() - started, query,
      section_key: scope?.section_key || null,
    }));
    return json({
      ok: true, campus, user_role: auth.role, program,
      answer: "", match_reason: "", source: null, handbook_section: null, matches: [],
      note: auth.role === "parent"
        ? "No parent handbook content is available for this campus yet."
        : "No matching documents found.",
    }, 200, request, env);
  }

  const top = rank(candidates, query, MAX_DOCS_TO_AI, semantic);
  const ai = await askOpenAI(env, buildPrompt({ query, campus, program, role: auth.role, scope, docs: top }));

  if (!ai.ok) {
    ctx.waitUntil(writeLog(env, {
      campus, user_role: auth.role, ok: false, ms: Date.now() - started, query, error: ai.error,
    }));
    return fail(ai.error, 502, request, env);
  }

  // Resolve the model's id against the permitted shortlist, so it can never
  // surface a document this caller wasn't allowed to see.
  let chosen = null;
  if (ai.id) {
    chosen =
      top.find((c) => c.id === ai.id && (!ai.section_key || c.section_key === ai.section_key)) ||
      top.find((c) => c.id === ai.id) ||
      null;
  }

  const handbookSection = chosen?.type === "handbook"
    ? {
        section_key: chosen.section_key,
        section_title: chosen.section_title || "",
        section_content: clamp(chosen.content, MAX_CHARS_PER_DOC),
      }
    : null;

  const payload = {
    ok: true,
    campus,
    user_role: auth.role,
    program,
    answer: ai.answer,
    match_reason: ai.match_reason,
    source: chosen
      ? {
          id: chosen.id,
          type: chosen.type,
          title: chosen.title,
          program: chosen.program || null,
          link: chosen.link || null,
        }
      : null,
    handbook_section: handbookSection,
    matches: top.map((c) => {
      const isChosen = chosen && c.id === chosen.id && c.section_key === chosen.section_key;
      return {
        id: c.id,
        type: c.type,
        title: c.title,
        program: c.program || null,
        link: c.link || null,
        section_key: c.section_key,
        answer: isChosen ? ai.answer : "",
        why: isChosen ? ai.match_reason : "",
      };
    }),
  };

  if (!chosen && !payload.answer) {
    payload.note = "I could not find that in the available documents. Try rephrasing, or check with the office.";
  }

  ctx.waitUntil(
    env.STATE.put(cacheKey, JSON.stringify(payload), { expirationTtl: AI_CACHE_TTL }).catch(() => {})
  );
  ctx.waitUntil(writeLog(env, {
    campus, user_role: auth.role, ok: Boolean(chosen), ms: Date.now() - started, query,
    source_type: chosen?.type || null,
    source_id: chosen?.id || null,
    source_title: chosen?.title || null,
    section_key: handbookSection?.section_key || null,
  }));

  return json(payload, 200, request, env);
}

// Shows what retrieval would send to the model for a question, and why —
// keyword score, meaning score, and the resulting order. No answer is
// generated and nothing is logged, so it is cheap to use for diagnosis.
async function handleDiagnose(request, env, url) {
  const auth = await authenticate(request, env, ["admin"]);
  if (!auth.ok) return fail("Unauthorized (admin token required)", 401, request, env);

  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) return fail("Missing q", 400, request, env);
  const campus = normCampus(url.searchParams.get("campus") || "MC");
  const program = normProgram(url.searchParams.get("program"));

  const started = Date.now();
  const report = {};
  const semantic = await buildSemantic(env, query, report);
  const candidates = await buildCandidates(env, {
    role: "staff", campus, program, scope: null, query, semantic,
  });
  const top = rank(candidates, query, MAX_DOCS_TO_AI, semantic);

  return json({
    ok: true,
    query,
    campus,
    semantic: Boolean(semantic),
    semantic_off_because: semantic ? null : (report.why || null),
    considered: candidates.length,
    ms: Date.now() - started,
    results: top.map((c, i) => ({
      position: i + 1,
      id: c.id,
      type: c.type,
      section_key: c.section_key || null,
      title: c.title,
      section_title: c.section_title || null,
      keyword_score: Math.round((c._lex ?? c._score ?? 0) * 100) / 100,
      meaning_score: c._sem == null ? null : Math.round(c._sem * 1000) / 1000,
    })),
  }, 200, request, env);
}

// Rebuilds the semantic index over every document a staff member could reach.
// Admin-only, and safe to re-run: it replaces the stored index wholesale.
async function handleReindex(request, env) {
  const auth = await authenticate(request, env, ["admin"]);
  if (!auth.ok) return fail("Unauthorized (admin token required)", 401, request, env);

  if (!embeddingsAvailable(env)) {
    let hint = "Configure an embedding provider.";
    try {
      const { name, provider } = providerConfig(env);
      hint = provider.secret
        ? `Provider "${name}" needs the ${provider.secret} secret.`
        : `Provider "${name}" needs an [ai] binding in wrangler.toml.`;
    } catch (e) {
      hint = e.message;
    }
    return fail(hint, 400, request, env);
  }

  const cfg = providerConfig(env);
  const started = Date.now();
  const items = [];

  for (const kind of ["policy", "protocol"]) {
    for (const entry of await loadIndex(env, kind)) {
      const doc = await loadDoc(env, kind, entry.id);
      if (doc) items.push({ ...doc, id: doc.id || entry.id, type: kind });
    }
  }

  // Enumerate handbooks from the store rather than a hard-coded campus list,
  // so a new campus is picked up without a code change.
  if (env.HANDBOOKS) {
    const listed = await env.HANDBOOKS.list({ prefix: "handbook_" });
    for (const k of listed.keys || []) {
      const parsed = safeParse(await env.HANDBOOKS.get(k.name), null);
      for (const hb of (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean)) {
        for (const sec of hb.sections || []) {
          items.push({
            id: hb.id || k.name, type: "handbook", title: hb.title, keywords: hb.keywords,
            section_key: sec.key, section_title: sec.title, content: sec.content,
          });
        }
      }
    }
  }

  if (!items.length) return fail("Nothing to index", 400, request, env);

  // Campuses can share a handbook id, so collapse duplicates.
  const seen = new Set();
  const unique = items.filter((it) => {
    const k = entryKey(it);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const vectors = [];
  const BATCH = 64;
  try {
    for (let i = 0; i < unique.length; i += BATCH) {
      const slice = unique.slice(i, i + BATCH);
      const got = await embed(env, slice.map(indexText), "document");
      if (got.length !== slice.length) {
        return fail("Embedding provider returned the wrong number of vectors", 502, request, env);
      }
      vectors.push(...got);
    }
  } catch (e) {
    return fail(`Embedding failed: ${e.message}`, 502, request, env);
  }

  const { dims, b64 } = packVectors(vectors);
  if (dims !== cfg.dims) {
    return fail(`Provider returned ${dims}-dimension vectors, expected ${cfg.dims}`, 502, request, env);
  }

  await env.STATE.put(SEMANTIC_INDEX_KEY, JSON.stringify({
    provider: cfg.name, model: cfg.model, dims, b64,
    keys: unique.map(entryKey),
    built_at: new Date().toISOString(),
  }));

  cacheSet(SEMANTIC_INDEX_KEY, null, 0);   // drop the isolate's stale copy

  return json({
    ok: true, provider: cfg.name, model: cfg.model, dims,
    indexed: unique.length, approx_kb: Math.round(b64.length / 1024),
    ms: Date.now() - started,
  }, 200, request, env);
}

async function handleAdminLogs(request, env, url) {
  const auth = await authenticate(request, env, ["admin"]);
  if (!auth.ok) return fail("Unauthorized (admin token required)", 401, request, env);

  const logs = await readLogs(env, url.searchParams.get("limit"));
  return json({ ok: true, count: logs.length, logs }, 200, request, env);
}

async function handleAdminStats(request, env, url) {
  const auth = await authenticate(request, env, ["admin"]);
  if (!auth.ok) return fail("Unauthorized (admin token required)", 401, request, env);

  const logs = await readLogs(env, url.searchParams.get("limit"));

  const bucket = () => ({ total: 0, ok: 0, bad: 0 });
  const byCampus = {};
  const byRole = { staff: bucket(), parent: bucket(), admin: bucket() };
  const bySourceType = {};

  let total = 0;
  let okCount = 0;
  let msSum = 0;

  for (const l of logs) {
    total++;
    const good = l.ok === true;
    if (good) okCount++;
    msSum += Number(l.ms || 0);

    const add = (map, key) => {
      const k = String(key || "unknown");
      if (!map[k]) map[k] = bucket();
      map[k].total++;
      map[k][good ? "ok" : "bad"]++;
    };

    add(byCampus, String(l.campus || "UNKNOWN").toUpperCase());
    add(byRole, String(l.user_role || "unknown").toLowerCase());
    add(bySourceType, String(l.source_type || "unknown").toLowerCase());
  }

  const bad = total - okCount;
  const avgMs = total ? Math.round(msSum / total) : 0;
  const okRate = total ? okCount / total : 1;

  let badge = "OK";
  if (okRate < 0.75 || avgMs > 6000) badge = "BAD";
  else if (okRate < 0.9 || avgMs > 3000) badge = "WARN";

  // `ok` is the envelope flag only. The success count is `ok_count`.
  // v1 emitted `ok` twice in one object literal, so the flag and the count
  // collided and a zero count made the dashboard throw.
  return json({
    ok: true,
    badge,
    total,
    ok_count: okCount,
    bad,
    avg_ms: avgMs,
    byCampus,
    byRole,
    bySourceType,
  }, 200, request, env);
}

// ============================================================
// Entry point
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request, env) });
    }

    try {
      if (path === "/" && method === "GET") {
        return json({ ok: true, service: SERVICE, status: "running", version: VERSION }, 200, request, env);
      }

      if (path === "/health" && method === "GET") {
        return json({
          ok: true,
          service: SERVICE,
          status: "running",
          version: VERSION,
          routes: {
            root: "GET /",
            health: "GET /health",
            auth_staff: "POST /auth/staff",
            auth_parent: "POST /auth/parent",
            auth_admin: "POST /auth/admin",
            handbooks: "GET /handbooks?campus=YC",
            doc: "GET /doc?type=policy&id=safe_arrival",
            api: "POST /api",
            admin_logs: "GET /admin/logs",
            admin_stats: "GET /admin/stats",
          },
        }, 200, request, env);
      }

      if (path.startsWith("/auth/")) {
        const role = path.slice(6);
        if (!["staff", "parent", "admin"].includes(role)) return fail("Not found", 404, request, env);
        if (method !== "POST") return fail("POST required", 405, request, env);
        return handleAuth(request, env, role);
      }

      if (path === "/handbooks") {
        if (method !== "GET") return fail("Only GET allowed", 405, request, env);
        return handleHandbooks(request, env, url);
      }

      if (path === "/doc") {
        if (method !== "GET") return fail("Only GET allowed", 405, request, env);
        return handleDoc(request, env, url);
      }

      if (path === "/api") {
        if (method !== "POST") return fail("Only POST allowed", 405, request, env);
        return handleApi(request, env, ctx);
      }

      if (path === "/admin/logs") {
        if (method !== "GET") return fail("Only GET allowed", 405, request, env);
        return handleAdminLogs(request, env, url);
      }

      if (path === "/admin/diagnose") {
        if (method !== "GET") return fail("Only GET allowed", 405, request, env);
        return handleDiagnose(request, env, url);
      }

      if (path === "/admin/reindex") {
        if (method !== "POST") return fail("Only POST allowed", 405, request, env);
        return handleReindex(request, env);
      }

      if (path === "/admin/stats") {
        if (method !== "GET") return fail("Only GET allowed", 405, request, env);
        return handleAdminStats(request, env, url);
      }

      return fail("Not found", 404, request, env);
    } catch (err) {
      // Log the detail for diagnosis; return a generic message so internal
      // error text never reaches the browser.
      console.error(`Unhandled error on ${method} ${path}:`, err?.stack || err?.message || String(err));
      return json({ ok: false, error: "Server error" }, 500, request, env);
    }
  },
};
