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
const AI_CACHE_TTL = 60 * 5;            // 5 minutes
const DOC_CACHE_MS = 60 * 1000;         // in-isolate
const MAX_DOCS_TO_AI = 8;
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

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "our", "with", "what",
  "when", "where", "how", "why", "can", "does", "did", "should", "would", "could",
  "this", "that", "there", "from", "have", "has", "had", "was", "were", "who",
  "a", "an", "of", "to", "in", "on", "is", "it", "at", "be", "do", "if", "or", "we",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Scores index entries (title + keywords only) and full candidates alike.
function score(item, tokens, rawQuery) {
  const title = String(item.title || "").toLowerCase();
  const sectionTitle = String(item.section_title || "").toLowerCase();
  const keywords = (item.keywords || []).join(" ").toLowerCase();
  const content = String(item.content || "").toLowerCase();
  const q = String(rawQuery || "").toLowerCase().trim();

  let s = 0;
  for (const t of tokens) {
    if (keywords.includes(t)) s += 6;
    if (title.includes(t)) s += 4;
    if (sectionTitle.includes(t)) s += 3;
    if (content.includes(t)) s += 1;
  }
  if (q.length > 6) {
    if (title.includes(q)) s += 12;
    if (sectionTitle.includes(q)) s += 10;
    if (keywords.includes(q)) s += 8;
  }
  if (content.length > 200) s += 1;
  return s;
}

function rank(items, query, limit) {
  const tokens = tokenize(query);
  const scored = items
    .map((c) => ({ ...c, _score: score(c, tokens, query) }))
    .sort((a, b) => b._score - a._score);

  const matched = scored.filter((c) => c._score > 0);
  return (matched.length ? matched : scored).slice(0, limit || MAX_DOCS_TO_AI);
}

// Index-first: the index carries title + keywords, the two heaviest signals,
// so shortlist on it and only then fetch bodies — in parallel.
// v1 expanded every policy and protocol on each cold request (~30 serial reads).
async function shortlistDocs(env, kind, { query, program, scope }) {
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

  const entries = indexHasKeywords ? rank(index, query, MAX_DOCS_TO_AI) : index;
  const docs = (await Promise.all(entries.map((e) => loadDoc(env, kind, e.id))))
    .filter((d) => d && programMatches(d.program, program));

  return indexHasKeywords ? docs : rank(docs, query, MAX_DOCS_TO_AI);
}

// Each handbook SECTION is its own candidate. v1 concatenated every section
// into one blob, so a large handbook crowded out everything else.
async function buildCandidates(env, { role, campus, program, scope, query }) {
  const type = scope?.type ? String(scope.type).toLowerCase() : null;

  const wantPolicies = role === "staff" && (!type || type === "policy");
  const wantProtocols = role === "staff" && (!type || type === "protocol");
  const wantHandbooks = !type || type === "handbook";

  const [policies, protocols] = await Promise.all([
    wantPolicies ? shortlistDocs(env, "policy", { query, program, scope }) : [],
    wantProtocols ? shortlistDocs(env, "protocol", { query, program, scope }) : [],
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

  const candidates = await buildCandidates(env, { role: auth.role, campus, program, scope, query });

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

  const top = rank(candidates, query, MAX_DOCS_TO_AI);
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
