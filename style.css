export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      // =========================
      // HEALTH
      // =========================
      if (url.pathname === "/health") {
        return json(
          {
            ok: true,
            kv: {
              cms_handbooks: !!env.cms_handbooks,
              cms_policies: !!env.cms_policies,
              cms_protocols: !!env.cms_protocols,
            },
            ai: {
              hasKey: !!env.OPENAI_API_KEY,
              model: env.OPENAI_MODEL || "gpt-4o-mini",
            },
          },
          200,
          request
        );
      }

      // =========================
      // LIST: POLICIES
      // GET /list/policies
      // =========================
      if (url.pathname === "/list/policies") {
        if (request.method !== "GET") return json({ ok: false, error: "GET required" }, 405, request);
        const items = await getPolicies(env);
        return json({ ok: true, items }, 200, request);
      }

      // =========================
      // LIST: PROTOCOLS
      // GET /list/protocols
      // =========================
      if (url.pathname === "/list/protocols") {
        if (request.method !== "GET") return json({ ok: false, error: "GET required" }, 405, request);
        const items = await getProtocols(env);
        return json({ ok: true, items }, 200, request);
      }

      // =========================
      // GET ONE DOC SECTION
      // GET /doc?type=policies&id=...
      // GET /doc?type=protocols&id=...
      // =========================
      if (url.pathname === "/doc") {
        if (request.method !== "GET") return json({ ok: false, error: "GET required" }, 405, request);

        const type = (url.searchParams.get("type") || "").trim().toLowerCase();
        const id = (url.searchParams.get("id") || "").trim();

        if (!type || !id) return json({ ok: false, error: "Missing type or id" }, 400, request);

        let list = [];
        if (type === "policies") list = await getPolicies(env);
        else if (type === "protocols") list = await getProtocols(env);
        else return json({ ok: false, error: "type must be policies|protocols" }, 400, request);

        const found = list.find((x) => x.id === id);
        if (!found) return json({ ok: false, error: "Not found" }, 404, request);

        return json({ ok: true, item: found }, 200, request);
      }

      // =========================
      // HANDBOOK LOAD
      // GET /handbook?campus=MC
      // reads KV cms_handbooks -> key handbook_MC ...
      // =========================
      if (url.pathname === "/handbook") {
        if (request.method !== "GET") return json({ ok: false, error: "GET required" }, 405, request);

        const campus = (url.searchParams.get("campus") || "").trim().toUpperCase();
        if (!campus) return json({ ok: false, error: "Missing campus" }, 400, request);

        const key = `handbook_${campus}`;
        const handbook = await kvJson(env.cms_handbooks, key);

        if (!handbook) {
          return json({ ok: false, error: `Handbook not found in KV: ${key}` }, 404, request);
        }

        return json({ ok: true, campus, handbook }, 200, request);
      }

      // =========================
      // CHAT API
      // POST /api
      // body: { question, campus, scope }
      // scope optional: "handbook" | "policies" | "protocols" | "all"
      // =========================
      if (url.pathname === "/api") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405, request);

        const body = await safeReadJson(request);
        if (!body.ok) return json({ ok: false, error: "Invalid JSON body" }, 400, request);

        const question = (body.data?.question || body.data?.q || "").toString().trim();
        const campus = (body.data?.campus || "").toString().trim().toUpperCase();
        const scope = (body.data?.scope || "all").toString().trim().toLowerCase();

        if (!question) return json({ ok: false, error: "Missing question" }, 400, request);

        // Load sources based on scope
        const sources = await buildSources(env, { campus, scope });

        // Retrieve relevant excerpts
        const retrieved = retrieveRelevant(question, sources, 8);

        // Build answer with OpenAI
        const answer = await generateAnswer(env, {
          question,
          campus,
          scope,
          retrieved,
        });

        return json(
          {
            ok: true,
            answer: answer.text,
            used: {
              scope,
              campus: campus || null,
              matched_items: retrieved.map((r) => ({
                source: r.source,
                id: r.id,
                title: r.title,
                link: r.link || null,
                score: r.score,
              })),
            },
          },
          200,
          request
        );
      }

      return json({ ok: false, error: "Not found" }, 404, request);
    } catch (err) {
      return json(
        { ok: false, error: "Server error", detail: (err && err.message) ? err.message : String(err) },
        500,
        request
      );
    }
  },
};

// =========================
// KV LOADERS
// =========================
async function getPolicies(env) {
  if (!env.cms_policies) return [];
  const arr = await kvJson(env.cms_policies, "policies");
  return normalizeItems(arr, "Policy");
}

async function getProtocols(env) {
  if (!env.cms_protocols) return [];
  const arr = await kvJson(env.cms_protocols, "protocols");
  return normalizeItems(arr, "Protocol");
}

function normalizeItems(arr, defaultType) {
  const items = Array.isArray(arr) ? arr : [];
  const cleaned = items
    .map((x) => ({
      type: x.type || defaultType,
      id: String(x.id || "").trim(),
      title: String(x.title || "").trim(),
      content: Array.isArray(x.content) ? x.content.map(String) : (x.content ? [String(x.content)] : []),
      keywords: Array.isArray(x.keywords) ? x.keywords.map(String) : [],
      order: Number.isFinite(x.order) ? x.order : (typeof x.order === "number" ? x.order : 9999),
      link: x.link ? String(x.link) : "",
    }))
    .filter((x) => x.id && x.title);

  cleaned.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));
  return cleaned;
}

async function kvJson(kv, key) {
  if (!kv) return null;
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// =========================
// BUILD SOURCES
// =========================
async function buildSources(env, { campus, scope }) {
  const sources = [];

  const wantHandbook = scope === "handbook" || scope === "all";
  const wantPolicies = scope === "policies" || scope === "all";
  const wantProtocols = scope === "protocols" || scope === "all";

  if (wantHandbook && env.cms_handbooks && campus) {
    const hb = await kvJson(env.cms_handbooks, `handbook_${campus}`);
    // handbook structure can be anything; we convert to "sections"
    // If your handbook is already array of sections: [{id,title,content:[...]}] it works.
    // If it is nested, we try to flatten.
    const hbSections = flattenHandbook(hb, campus);
    sources.push(...hbSections.map((s) => ({ ...s, source: `handbook_${campus}` })));
  }

  if (wantPolicies) {
    const policies = await getPolicies(env);
    sources.push(...policies.map((p) => ({ ...p, source: "policies" })));
  }

  if (wantProtocols) {
    const protocols = await getProtocols(env);
    sources.push(...protocols.map((p) => ({ ...p, source: "protocols" })));
  }

  return sources;
}

// tries to make handbook searchable even if nested
function flattenHandbook(handbookJson, campus) {
  // If already array of {id,title,content}
  if (Array.isArray(handbookJson)) {
    return normalizeItems(handbookJson, `Handbook ${campus}`);
  }

  // If object with sections
  // common pattern: { title, sections:[...] } or { sections:{...} }
  const out = [];

  if (!handbookJson || typeof handbookJson !== "object") return out;

  // sections: array
  if (Array.isArray(handbookJson.sections)) {
    const items = handbookJson.sections.map((s, idx) => ({
      id: s.id || `hb_${campus}_${idx + 1}`,
      title: s.title || s.heading || `Section ${idx + 1}`,
      content: Array.isArray(s.content) ? s.content : (s.text ? [s.text] : []),
      keywords: s.keywords || [],
      order: s.order ?? (idx + 1),
      link: s.link || "",
      type: `Handbook ${campus}`,
    }));
    return normalizeItems(items, `Handbook ${campus}`);
  }

  // sections: object map
  if (handbookJson.sections && typeof handbookJson.sections === "object") {
    let idx = 0;
    for (const [k, v] of Object.entries(handbookJson.sections)) {
      idx++;
      out.push({
        id: (v && v.id) ? v.id : `hb_${campus}_${k}`,
        title: (v && (v.title || v.heading)) ? (v.title || v.heading) : k,
        content: Array.isArray(v?.content) ? v.content : (v?.text ? [v.text] : []),
        keywords: Array.isArray(v?.keywords) ? v.keywords : [],
        order: Number.isFinite(v?.order) ? v.order : idx,
        link: v?.link ? String(v.link) : "",
        type: `Handbook ${campus}`,
      });
    }
    return normalizeItems(out, `Handbook ${campus}`);
  }

  // fallback: stringify
  return [
    {
      id: `hb_${campus}_full`,
      title: `Parent Handbook - ${campus}`,
      content: [JSON.stringify(handbookJson)],
      keywords: [],
      order: 1,
      link: "",
      type: `Handbook ${campus}`,
    },
  ];
}

// =========================
// RETRIEVAL (simple + fast)
// =========================
function retrieveRelevant(question, sources, topK = 8) {
  const q = normalize(question);
  const qTokens = tokenize(q);

  const scored = sources.map((item) => {
    const hay = normalize(
      [
        item.title,
        (item.keywords || []).join(" "),
        ...(Array.isArray(item.content) ? item.content : []),
      ].join(" ")
    );

    const score = scoreMatch(qTokens, hay, item);
    return { ...item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored.filter((x) => x.score > 0).slice(0, topK);

  // If nothing matched, just take first few from requested scope (still answer but will be cautious)
  return best.length ? best : scored.slice(0, Math.min(topK, scored.length));
}

function scoreMatch(qTokens, hay, item) {
  let s = 0;

  // title boost
  const title = normalize(item.title || "");
  for (const t of qTokens) {
    if (!t) continue;
    if (title.includes(t)) s += 8;
  }

  // keyword boost
  const kw = normalize((item.keywords || []).join(" "));
  for (const t of qTokens) {
    if (kw.includes(t)) s += 6;
  }

  // body
  for (const t of qTokens) {
    if (hay.includes(t)) s += 2;
  }

  return s;
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(str) {
  return normalize(str)
    .split(" ")
    .map((t) => t.replace(/[^a-z0-9_-]/g, ""))
    .filter((t) => t.length >= 3)
    .slice(0, 30);
}

// =========================
// AI ANSWER (not too short)
// =========================
async function generateAnswer(env, { question, campus, scope, retrieved }) {
  if (!env.OPENAI_API_KEY) {
    // fallback if no AI key
    return {
      text:
        "AI key is missing. Please set OPENAI_API_KEY in Worker environment variables. " +
        "I can still show the most relevant CMS text excerpts:\n\n" +
        retrieved
          .slice(0, 3)
          .map((r) => `• ${r.title}\n${(r.content || []).slice(0, 6).join("\n")}`)
          .join("\n\n"),
    };
  }

  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  const contextBlocks = retrieved.slice(0, 6).map((r, i) => {
    const excerpt = (r.content || []).slice(0, 18).join("\n");
    return `SOURCE ${i + 1} (${r.source})\nTitle: ${r.title}\nID: ${r.id}\nLink: ${r.link || "N/A"}\nContent:\n${excerpt}`;
  });

  const systemPrompt = `
You are a CMS Policy/Protocol/Handbook assistant for staff and parents.

HARD RULES:
- Use ONLY the provided SOURCE texts. Do not invent or guess.
- If the sources do not contain the answer, say what is missing and suggest what to ask the office/admin.
- Write in clear English.
- The answer must NOT be overly short: produce at least 8–10 lines (full sentences). Avoid one-paragraph tiny summaries.
- If helpful, use short bullet points, but still keep enough detail.
- When relevant, mention whether this is from Policy, Protocol, or Parent Handbook (naturally).
`;

  const userPrompt = `
Campus: ${campus || "N/A"}
Scope: ${scope}

Question:
${question}

SOURCES:
${contextBlocks.join("\n\n")}

Now answer the question using ONLY the sources above. Make it complete and not too short (minimum 8–10 lines).
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt.trim() },
        { role: "user", content: userPrompt.trim() },
      ],
      temperature: 0.2,
      max_tokens: Number(env.OPENAI_MAX_TOKENS || 600),
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { text: `AI error (${res.status}). ${txt}` };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || "No answer generated.";
  return { text };
}

// =========================
// HELPERS
// =========================
async function safeReadJson(request) {
  try {
    const data = await request.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

function json(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

function corsHeaders(request) {
  const origin = request?.headers?.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}
