export async function onRequestGet({ request, env }) {
  const corsHeaders = cors();

  const user = await validateAnyToken(env, request);
  if (!user.ok) return j({ ok: false, error: "Unauthorized" }, 401, corsHeaders);

  const url = new URL(request.url);
  const campus = String(url.searchParams.get("campus") || "").trim().toUpperCase();
  if (!campus) return j({ ok: false, error: "Missing campus" }, 400, corsHeaders);

  // IMPORTANT: your KV keys are handbook_MC, handbook_YC, ...
  const key = `handbook_${campus}`;
  const raw = await env.cms_handbooks.get(key);
  const handbooks = raw ? safeJsonParse(raw, []) : [];

  const id = String(url.searchParams.get("id") || "").trim();
  const sectionKey = String(url.searchParams.get("section") || "").trim();

  // list
  if (!id) {
    const list = Array.isArray(handbooks)
      ? handbooks.map((hb) => ({
          id: hb?.id || null,
          campus: hb?.campus || campus,
          program: hb?.program || null,
          title: hb?.title || "Parent Handbook",
          link: hb?.link || null,
          sections: Array.isArray(hb?.sections)
            ? hb.sections.map((s) => ({ key: s?.key || "", title: s?.title || "" }))
            : []
        }))
      : [];
    return j({ ok: true, campus, count: list.length, handbooks: list }, 200, corsHeaders);
  }

  const hb = Array.isArray(handbooks)
    ? handbooks.find((x) => String(x?.id || "") === id)
    : null;

  if (!hb) return j({ ok: false, error: "Handbook not found" }, 404, corsHeaders);

  // one section
  if (sectionKey) {
    const sec = Array.isArray(hb?.sections)
      ? hb.sections.find((s) => String(s?.key || "").trim() === sectionKey)
      : null;

    if (!sec) return j({ ok: false, error: "Section not found" }, 404, corsHeaders);

    return j(
      {
        ok: true,
        campus,
        handbook: { id: hb.id, title: hb.title, program: hb.program || null, link: hb.link || null },
        section: { key: sec.key, title: sec.title || "", content: normalizeText(sec.content) }
      },
      200,
      corsHeaders
    );
  }

  // one handbook full
  return j(
    {
      ok: true,
      campus,
      handbook: {
        id: hb.id,
        title: hb.title,
        program: hb.program || null,
        link: hb.link || null,
        sections: Array.isArray(hb?.sections)
          ? hb.sections.map((s) => ({
              key: s?.key || "",
              title: s?.title || "",
              content: normalizeText(s?.content)
            }))
          : []
      }
    },
    200,
    corsHeaders
  );
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function j(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}

async function validateAnyToken(env, request) {
  const token = getBearerToken(request);
  if (!token) return { ok: false, role: "", token: "" };

  if (await env.cms_auth.get(`staff:${token}`)) return { ok: true, role: "staff", token };
  if (await env.cms_auth.get(`parent:${token}`)) return { ok: true, role: "parent", token };
  if (await env.cms_auth.get(`admin:${token}`)) return { ok: true, role: "admin", token };

  return { ok: false, role: "", token: "" };
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