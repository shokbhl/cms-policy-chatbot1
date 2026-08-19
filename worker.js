export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    try {
      if (url.pathname === "/") {
        return json({ ok: true, service: "cms-policy-worker", status: "running" });
      }

      if (url.pathname === "/health") {
        return json({
          ok: true,
          service: "cms-policy-worker",
          status: "running",
          version: "stable-optimized",
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
            admin_stats: "GET /admin/stats"
          }
        });
      }

      // =========================
      // AUTH: STAFF
      // =========================
      if (url.pathname === "/auth/staff") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

        const ip = getClientIp(request);
        const rl = await rateLimitKV(env, `rl:auth_staff:${ip}`, 10, 60);
        if (!rl.ok) return tooMany(rl.retry_after);

        const body = await safeReadJson(request);
        if (!body.ok) return json({ ok: false, error: "Invalid JSON" }, 400);

        const code = String(body.data?.code ?? body.data?.data?.code ?? "").trim();
        if (!code) return json({ ok: false, error: "Missing code" }, 400);

        if (!env.STAFF_CODE) return json({ ok: false, error: "STAFF_CODE not set" }, 500);
        if (code !== env.STAFF_CODE) return json({ ok: false, error: "Invalid code" }, 401);

        const token = crypto.randomUUID();
        const expiresIn = 8 * 60 * 60;

        await env.cms_logs.put(`staff:${token}`, JSON.stringify({ created: Date.now() }), {
          expirationTtl: expiresIn
        });

        return json({ ok: true, token, expires_in: expiresIn, role: "staff" });
      }

      // =========================
      // AUTH: PARENT
      // =========================
      if (url.pathname === "/auth/parent") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

        const ip = getClientIp(request);
        const rl = await rateLimitKV(env, `rl:auth_parent:${ip}`, 10, 60);
        if (!rl.ok) return tooMany(rl.retry_after);

        const body = await safeReadJson(request);
        if (!body.ok) return json({ ok: false, error: "Invalid JSON" }, 400);

        const code = String(body.data?.code ?? body.data?.data?.code ?? "").trim();
        if (!code) return json({ ok: false, error: "Missing code" }, 400);

        if (!env.PARENT_CODE) return json({ ok: false, error: "PARENT_CODE not set" }, 500);
        if (code !== env.PARENT_CODE) return json({ ok: false, error: "Invalid code" }, 401);

        const token = crypto.randomUUID();
        const expiresIn = 8 * 60 * 60;

        await env.cms_logs.put(`parent:${token}`, JSON.stringify({ created: Date.now() }), {
          expirationTtl: expiresIn
        });

        return json({ ok: true, token, expires_in: expiresIn, role: "parent" });
      }

      // =========================
      // AUTH: ADMIN
      // =========================
      if (url.pathname === "/auth/admin") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

        const ip = getClientIp(request);
        const rl = await rateLimitKV(env, `rl:auth_admin:${ip}`, 10, 60);
        if (!rl.ok) return tooMany(rl.retry_after);

        const body = await safeReadJson(request);
        if (!body.ok) return json({ ok: false, error: "Invalid JSON" }, 400);

        const pin = String(body.data?.pin ?? body.data?.data?.pin ?? "").trim();
        if (!pin) return json({ ok: false, error: "Missing pin" }, 400);

        if (!env.ADMIN_PIN) return json({ ok: false, error: "ADMIN_PIN not set" }, 500);
        if (pin !== env.ADMIN_PIN) return json({ ok: false, error: "Invalid admin PIN" }, 401);

        const token = crypto.randomUUID();
        const expiresIn = 8 * 60 * 60;

        await env.cms_logs.put(`admin:${token}`, JSON.stringify({ created: Date.now() }), {
          expirationTtl: expiresIn
        });

        return json({ ok: true, token, expires_in: expiresIn, role: "admin" });
      }

      const anyUser = await validateAnyToken(env, request);

      // =========================
      // HANDBOOKS
      // =========================
      if (url.pathname === "/handbooks") {
        if (request.method !== "GET") return json({ ok: false, error: "Only GET allowed" }, 405);
        if (!anyUser.ok) return json({ ok: false, error: "Unauthorized (token required)" }, 401);

        const campus = String(url.searchParams.get("campus") || "").trim().toUpperCase();
        if (!campus) return json({ ok: false, error: "Missing campus" }, 400);

        const handbookKey = `handbook_${campus}`;
        const raw = await env.cms_handbooks.get(handbookKey);
        const handbooks = raw ? safeJsonParse(raw, []) : [];

        const id = String(url.searchParams.get("id") || "").trim();
        const sectionKey = String(url.searchParams.get("section") || "").trim();

        if (!id) {
          const list = Array.isArray(handbooks)
            ? handbooks.map((hb) => ({
                id: hb?.id || null,
                type: hb?.type || "handbook",
                campus: hb?.campus || campus,
                program: hb?.program || null,
                title: hb?.title || "Parent Handbook",
                link: typeof hb?.link === "string" ? hb.link : null,
                sections: Array.isArray(hb?.sections)
                  ? hb.sections.map((s) => ({
                      key: s?.key || "",
                      title: s?.title || ""
                    }))
                  : []
              }))
            : [];

          return json({ ok: true, campus, count: list.length, handbooks: list });
        }

        const hb = Array.isArray(handbooks)
          ? handbooks.find((x) => String(x?.id || "") === id)
          : null;

        if (!hb) return json({ ok: false, error: "Handbook not found" }, 404);

        if (sectionKey) {
          const sec = Array.isArray(hb.sections)
            ? hb.sections.find((s) => String(s?.key || "").trim() === sectionKey)
            : null;

          if (!sec) return json({ ok: false, error: "Section not found" }, 404);

          return json({
            ok: true,
            campus,
            handbook: {
              id: hb.id,
              type: hb.type || "handbook",
              title: hb.title || "Parent Handbook",
              program: hb.program || null,
              link: typeof hb?.link === "string" ? hb.link : null
            },
            section: {
              key: sec.key,
              title: sec.title || "",
              content: normalizeText(sec.content)
            }
          });
        }

        return json({
          ok: true,
          campus,
          handbook: {
            id: hb.id,
            type: hb.type || "handbook",
            title: hb.title || "Parent Handbook",
            program: hb.program || null,
            link: typeof hb?.link === "string" ? hb.link : null,
            sections: Array.isArray(hb.sections)
              ? hb.sections.map((s) => ({
                  key: s?.key || "",
                  title: s?.title || "",
                  content: normalizeText(s?.content)
                }))
              : []
          }
        });
      }

      // =========================
      // DOC PREVIEW
      // =========================
      if (url.pathname === "/doc") {
        if (request.method !== "GET") return json({ ok: false, error: "Only GET allowed" }, 405);

        const user = await validateAnyToken(env, request);
        if (!user.ok) return json({ ok: false, error: "Unauthorized (token required)" }, 401);

        const type = String(url.searchParams.get("type") || "").trim().toLowerCase();
        const id = String(url.searchParams.get("id") || "").trim();

        if (!type) return json({ ok: false, error: "Missing type" }, 400);
        if (!id) return json({ ok: false, error: "Missing id" }, 400);

        let namespace = null;
        let indexKey = "";

        if (type === "policy") {
          namespace = env.cms_policies;
          indexKey = "policies";
        } else if (type === "protocol") {
          namespace = env.cms_protocols;
          indexKey = "protocols";
        } else {
          return json({ ok: false, error: "Invalid type" }, 400);
        }

        const indexRaw = await namespace.get(indexKey);
        const indexList = indexRaw ? safeJsonParse(indexRaw, []) : [];

        const meta = Array.isArray(indexList)
          ? indexList.find((x) => String(x?.id || "").trim() === id)
          : null;

        if (!meta) return json({ ok: false, error: "Document not found in index" }, 404);

        const kvKey = String(meta?.kv_key || id).trim();
        const raw = await namespace.get(kvKey);

        if (!raw) return json({ ok: false, error: "Document content not found" }, 404);

        const full = safeJsonParse(raw, null);
        if (!full) return json({ ok: false, error: "Invalid document JSON" }, 500);

        return json({
          ok: true,
          doc: {
            id: full?.id || meta?.id || kvKey,
            type: full?.type || meta?.type || type,
            title: full?.title || meta?.title || kvKey,
            content: normalizeText(full?.content),
            keywords: Array.isArray(full?.keywords)
              ? full.keywords
              : Array.isArray(meta?.keywords)
                ? meta.keywords
                : [],
            link: typeof full?.link === "string"
              ? full.link
              : typeof meta?.link === "string"
                ? meta.link
                : null
          }
        });
      }

      // =========================
      // ADMIN
      // =========================
      if (url.pathname.startsWith("/admin/")) {
        if (!anyUser.ok || anyUser.role !== "admin") {
          return json({ ok: false, error: "Unauthorized (admin token required)" }, 401);
        }

        if (url.pathname === "/admin/logs") {
          const limit = clampInt(url.searchParams.get("limit"), 1, 200, 120);
          const list = await env.cms_logs.list({ prefix: "log:", limit });

          const logs = [];
          for (const k of list.keys) {
            const raw = await env.cms_logs.get(k.name);
            if (!raw) continue;
            try {
              logs.push(JSON.parse(raw));
            } catch {}
          }

          logs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
          return json({ ok: true, count: logs.length, logs });
        }

        if (url.pathname === "/admin/stats") {
          const limit = clampInt(url.searchParams.get("limit"), 50, 300, 200);
          const list = await env.cms_logs.list({ prefix: "log:", limit });

          const rows = [];
          for (const k of list.keys) {
            const raw = await env.cms_logs.get(k.name);
            if (!raw) continue;
            try {
              rows.push(JSON.parse(raw));
            } catch {}
          }

          const total = rows.length;
          const okCount = rows.filter((r) => r.ok === true).length;
          const badCount = total - okCount;
          const msValues = rows.map((r) => Number(r.ms || 0)).filter((n) => Number.isFinite(n) && n >= 0);
          const avgMs = msValues.length ? Math.round(msValues.reduce((a, b) => a + b, 0) / msValues.length) : 0;

          const byCampus = {};
          const byRole = {};
          const bySourceType = {};

          for (const r of rows) {
            const c = r.campus || "UNKNOWN";
            byCampus[c] = byCampus[c] || { total: 0, ok: 0, bad: 0 };
            byCampus[c].total++;
            if (r.ok) byCampus[c].ok++;
            else byCampus[c].bad++;

            const rr = r.user_role || "unknown";
            byRole[rr] = byRole[rr] || { total: 0, ok: 0, bad: 0 };
            byRole[rr].total++;
            if (r.ok) byRole[rr].ok++;
            else byRole[rr].bad++;

            const st = r.source_type || "unknown";
            bySourceType[st] = bySourceType[st] || { total: 0, ok: 0, bad: 0 };
            bySourceType[st].total++;
            if (r.ok) bySourceType[st].ok++;
            else bySourceType[st].bad++;
          }

          const okRate = total ? okCount / total : 1;
          let badge = "OK";
          if (okRate < 0.9) badge = "WARN";
          if (okRate < 0.75) badge = "BAD";

          return json({
            ok: true,
            badge,
            total,
            ok: okCount,
            bad: badCount,
            avg_ms: avgMs,
            byCampus,
            byRole,
            bySourceType
          });
        }

        return json({ ok: false, error: "Not found" }, 404);
      }

      // =========================
      // API
      // =========================
      if (url.pathname === "/api") {
        if (request.method !== "POST") return json({ ok: false, error: "Only POST allowed" }, 405);

        const user = await validateChatToken(env, request);
        if (!user.ok) return json({ ok: false, error: "Unauthorized (staff/parent token required)" }, 401);

        const rl = await rateLimitKV(env, `rl:api:${user.token}`, 60, 60);
        if (!rl.ok) return tooMany(rl.retry_after);

        const body = await safeReadJson(request);
        if (!body.ok) return json({ ok: false, error: "Invalid JSON" }, 400);

        const payload = body.data?.data ?? body.data ?? {};
        const query = String(payload.query || "").trim();
        const campus = String(payload.campus || "").trim().toUpperCase();
        const program = normalizeProgram(payload.program || "");
        const scope = payload.scope || null;

        if (!campus) return json({ ok: false, error: "Missing campus" }, 400);
        if (!query) return json({ ok: false, error: "Missing query" }, 400);

        const cachedAiKey = `ai:${user.role}:${campus}:${program}:${hashString(query + JSON.stringify(scope || {}))}`;
        const cachedAiRaw = await env.cms_logs.get(cachedAiKey);
        if (cachedAiRaw) {
          try {
            return json(JSON.parse(cachedAiRaw));
          } catch {}
        }

        const { policies, protocols } = await getCachedPolicyProtocolDocs(env);

        const handbookKey = `handbook_${campus}`;
        const handbookRaw = await env.cms_handbooks.get(handbookKey);
        const handbooks = handbookRaw ? safeJsonParse(handbookRaw, []) : [];
        const handbookDocs = Array.isArray(handbooks) ? handbooks.map(normalizeHandbookDoc) : [];

        let allDocs = user.role === "parent"
          ? [...handbookDocs]
          : [...policies, ...protocols, ...handbookDocs];

        if (scope && typeof scope === "object") {
          const scopeType = String(scope.type || "").trim().toLowerCase();
          const scopeId = String(scope.id || "").trim();
          const scopeSectionKey = String(scope.section_key || "").trim();

          if (scopeType) {
            allDocs = allDocs.filter((d) => String(d?.type || "").toLowerCase() === scopeType);
          }

          if (scopeId) {
            allDocs = allDocs.filter((d) => String(d?.id || "") === scopeId);
          }

          if (scopeType === "handbook" && scopeSectionKey) {
            allDocs = allDocs
              .map((d) => {
                if (!Array.isArray(d.sections)) return null;
                const sec = d.sections.find((s) => String(s?.key || "") === scopeSectionKey);
                if (!sec) return null;
                return { ...d, sections: [sec] };
              })
              .filter(Boolean);
          }
        }

        if (!allDocs.length) {
          const emptyResponse = {
            ok: true,
            campus,
            user_role: user.role,
            program: program || "ALL",
            answer: "",
            source: null,
            handbook_section: null,
            matches: [],
            note: "No matching documents found."
          };

          await writeLog(env, {
            campus,
            user_role: user.role,
            ok: false,
            ms: 0,
            query,
            source_type: null,
            source_id: null,
            section_key: scope?.section_key || null
          });

          return json(emptyResponse);
        }

        const rankedDocs = rankDocs(allDocs, query).slice(0, 8);
        const docsForAi = rankedDocs.length ? rankedDocs : allDocs.slice(0, 8);

        const searchData = docsForAi
          .map((p) => {
            const contentText = getDocText(p);
            const kwText = Array.isArray(p.keywords) ? p.keywords.join(", ") : "";
            return [
              `ID: ${p.id}`,
              `Type: ${p.type || "doc"}`,
              `Campus: ${p.campus || ""}`,
              `Program: ${p.program || ""}`,
              `Title: ${p.title || ""}`,
              `Keywords: ${kwText}`,
              `Text:\n${contentText}`
            ].join("\n");
          })
          .join("\n\n-----\n\n");

        const t0 = Date.now();

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.1,
            max_tokens: 450,
            messages: [
              {
                role: "system",
                content: `
You are a CMS assistant.
Return valid JSON only. No markdown. No backticks.

Return exactly:
{
  "id": "best_doc_id_or_null",
  "answer": "clear helpful answer",
  "match_reason": "short reason",
  "section_key": "best_section_key_or_null"
}

Rules:
- If documents are already scope-limited, answer ONLY from those.
- If the best result is a handbook section, return that section_key.
- Keep answers clear and practical.
- If nothing fits, return id as null.
`
              },
              {
                role: "user",
                content: `Campus: ${campus}
User role: ${user.role}
Program: ${program || "ALL"}
User question: ${query}

Documents:
${searchData}`
              }
            ]
          })
        });

        const aiJson = await aiRes.json();

        let match;
        try {
          match = JSON.parse(aiJson?.choices?.[0]?.message?.content || "{}");
        } catch {
          await writeLog(env, {
            campus,
            user_role: user.role,
            ok: false,
            ms: Date.now() - t0,
            query,
            source_type: null,
            source_id: null,
            section_key: scope?.section_key || null
          });

          return json({ ok: false, error: "AI returned non-JSON", raw: aiJson }, 500);
        }

        const doc = match?.id ? allDocs.find((d) => String(d.id) === String(match.id)) : null;
        const ms = Date.now() - t0;

        let handbookSection = null;
        const sectionKey = String(match?.section_key || "").trim() || null;

        if (doc?.type === "handbook" && Array.isArray(doc.sections) && sectionKey) {
          const sec = doc.sections.find((s) => String(s?.key || "") === sectionKey);
          if (sec) {
            handbookSection = {
              section_key: sec.key,
              section_title: sec.title || "",
              section_content: normalizeText(sec.content)
            };
          }
        }

        await writeLog(env, {
          campus,
          user_role: user.role,
          ok: true,
          ms,
          query,
          source_type: doc?.type || null,
          source_id: doc?.id || null,
          section_key: handbookSection?.section_key || sectionKey || null
        });

        const responsePayload = {
          ok: true,
          campus,
          user_role: user.role,
          program: program || "ALL",
          answer: String(match?.answer || "").trim(),
          match_reason: String(match?.match_reason || "").trim(),
          source: doc
            ? {
                id: doc.id,
                type: doc.type || "doc",
                title: doc.title || "",
                program: doc.program || null,
                link: typeof doc.link === "string" ? doc.link : null
              }
            : null,
          handbook_section: handbookSection,
          matches: doc
            ? [
                {
                  id: doc.id,
                  type: doc.type || "doc",
                  title: doc.title || "",
                  program: doc.program || null,
                  link: typeof doc.link === "string" ? doc.link : null,
                  section_key: handbookSection?.section_key || null,
                  answer: String(match?.answer || "").trim(),
                  why: String(match?.match_reason || "").trim()
                }
              ]
            : []
        };

        await env.cms_logs.put(cachedAiKey, JSON.stringify(responsePayload), {
          expirationTtl: 60 * 5
        });

        return json(responsePayload);
      }

      return json({ ok: false, error: "Not found" }, 404);
    } catch (err) {
      return json({ ok: false, error: "Server error", detail: err?.message || String(err) }, 500);
    }
  }
};

// =========================
// HELPERS
// =========================

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors()
    }
  });
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}

function normalizeText(x) {
  if (x == null) return "";
  if (Array.isArray(x)) return x.join("\n");
  return String(x);
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeProgram(p) {
  const s = String(p || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "all" || s === "all programs" || s === "all_programs") return "ALL";
  if (s.includes("preschool")) return "PRESCHOOL";
  if (s.includes("sr") || s.includes("casa")) return "SR_CASA";
  if (s.includes("elementary")) return "ELEMENTARY";
  return s.toUpperCase();
}

function normalizeHandbookDoc(hb) {
  return {
    id: hb?.id || `handbook:${crypto.randomUUID()}`,
    type: hb?.type || "handbook",
    campus: hb?.campus || "",
    program: hb?.program || "",
    title: hb?.title || "Parent Handbook",
    sections: Array.isArray(hb?.sections) ? hb.sections : [],
    content: hb?.content ?? "",
    keywords: Array.isArray(hb?.keywords) ? hb.keywords : ["handbook", "parent handbook"],
    link: typeof hb?.link === "string" ? hb.link : null
  };
}

async function getCachedPolicyProtocolDocs(env) {
  const CACHE_TTL = 60 * 1000;

  if (!globalThis.CMS_DOC_CACHE) {
    globalThis.CMS_DOC_CACHE = {
      policies: null,
      protocols: null,
      ts: 0
    };
  }

  const cache = globalThis.CMS_DOC_CACHE;

  if (!cache.policies || !cache.protocols || Date.now() - cache.ts > CACHE_TTL) {
    const policiesIndexRaw = await env.cms_policies.get("policies");
    const protocolsIndexRaw = await env.cms_protocols.get("protocols");

    const policiesIndex = policiesIndexRaw ? safeJsonParse(policiesIndexRaw, []) : [];
    const protocolsIndex = protocolsIndexRaw ? safeJsonParse(protocolsIndexRaw, []) : [];

    cache.policies = await expandDocsFromIndex(env.cms_policies, policiesIndex, "policy");
    cache.protocols = await expandDocsFromIndex(env.cms_protocols, protocolsIndex, "protocol");
    cache.ts = Date.now();
  }

  return {
    policies: cache.policies || [],
    protocols: cache.protocols || []
  };
}

async function expandDocsFromIndex(namespace, indexList = [], fallbackType = "doc") {
  const out = [];

  for (const meta of Array.isArray(indexList) ? indexList : []) {
    const id = String(meta?.id || "").trim();
    const kvKey = String(meta?.kv_key || id).trim();

    let full = null;

    if (kvKey) {
      const raw = await namespace.get(kvKey);
      if (raw) full = safeJsonParse(raw, null);
    }

    const doc = full
      ? {
          ...meta,
          ...full,
          id: full?.id || meta?.id || kvKey,
          type: full?.type || meta?.type || fallbackType,
          title: full?.title || meta?.title || kvKey,
          keywords: Array.isArray(full?.keywords)
            ? full.keywords
            : Array.isArray(meta?.keywords)
              ? meta.keywords
              : [],
          link: typeof full?.link === "string"
            ? full.link
            : typeof meta?.link === "string"
              ? meta.link
              : null
        }
      : {
          ...meta,
          id: meta?.id || kvKey,
          type: meta?.type || fallbackType,
          title: meta?.title || kvKey,
          keywords: Array.isArray(meta?.keywords) ? meta.keywords : [],
          link: typeof meta?.link === "string" ? meta.link : null
        };

    out.push(doc);
  }

  return out;
}

function getDocText(doc) {
  const parts = [];

  if (doc?.title) parts.push(String(doc.title));

  if (doc?.content != null) {
    if (Array.isArray(doc.content)) parts.push(doc.content.join(" "));
    else parts.push(String(doc.content));
  }

  if (Array.isArray(doc?.sections)) {
    for (const s of doc.sections) {
      const title = s?.title ? `Section: ${s.title}` : "Section";
      const content = normalizeText(s?.content);
      parts.push(`${title}\n${content}`);
    }
  }

  return parts.join("\n\n");
}

function rankDocs(docs, query) {
  const q = String(query || "").toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 2);

  return docs
    .map((doc) => {
      const title = String(doc?.title || "").toLowerCase();
      const keywords = Array.isArray(doc?.keywords) ? doc.keywords.join(" ").toLowerCase() : "";
      const text = getDocText(doc).toLowerCase();

      let score = 0;

      if (title.includes(q)) score += 20;
      if (keywords.includes(q)) score += 15;
      if (text.includes(q)) score += 10;

      for (const w of words) {
        if (title.includes(w)) score += 5;
        if (keywords.includes(w)) score += 4;
        if (text.includes(w)) score += 1;
      }

      return { doc, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.doc);
}

function hashString(str) {
  let h = 0;
  const s = String(str || "");

  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }

  return String(h);
}

async function writeLog(env, payload) {
  const logObj = {
    ts: Date.now(),
    campus: payload.campus || "UNKNOWN",
    user_role: payload.user_role || "unknown",
    ok: !!payload.ok,
    ms: Number(payload.ms || 0),
    query: String(payload.query || ""),
    source_type: payload.source_type || null,
    source_id: payload.source_id || null,
    section_key: payload.section_key || null
  };

  const key = `log:${logObj.ts}:${crypto.randomUUID()}`;

  await env.cms_logs.put(key, JSON.stringify(logObj), {
    expirationTtl: 60 * 60 * 24 * 30
  });
}

async function rateLimitKV(env, key, limit, windowSec) {
  const now = Date.now();
  const windowId = Math.floor(now / (windowSec * 1000));
  const bucketKey = `${key}:${windowId}`;

  const raw = await env.cms_logs.get(bucketKey);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= limit) {
    return {
      ok: false,
      limit,
      retry_after: windowSec - Math.floor((now / 1000) % windowSec)
    };
  }

  await env.cms_logs.put(bucketKey, String(count + 1), {
    expirationTtl: windowSec + 5
  });

  return { ok: true };
}

function tooMany(retryAfterSec) {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.max(1, retryAfterSec || 1)),
      ...cors()
    }
  });
}

async function safeReadJson(request) {
  try {
    const data = await request.json();
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  }
}

async function validateAnyToken(env, request) {
  const token = getBearerToken(request);
  if (!token) return { ok: false, role: "", token: "" };

  const staffOk = await env.cms_logs.get(`staff:${token}`);
  if (staffOk) return { ok: true, role: "staff", token };

  const parentOk = await env.cms_logs.get(`parent:${token}`);
  if (parentOk) return { ok: true, role: "parent", token };

  const adminOk = await env.cms_logs.get(`admin:${token}`);
  if (adminOk) return { ok: true, role: "admin", token };

  return { ok: false, role: "", token: "" };
}

async function validateChatToken(env, request) {
  const token = getBearerToken(request);
  if (!token) return { ok: false, role: "", token: "" };

  const staffOk = await env.cms_logs.get(`staff:${token}`);
  if (staffOk) return { ok: true, role: "staff", token };

  const parentOk = await env.cms_logs.get(`parent:${token}`);
  if (parentOk) return { ok: true, role: "parent", token };

  return { ok: false, role: "", token: "" };
}
