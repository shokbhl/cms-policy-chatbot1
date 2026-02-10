// /functions/[[path]].js
// One catch-all proxy from Pages -> Worker
// Supports: GET/POST/OPTIONS for /api, /auth/*, /handbooks, /policies, /protocols, ...

const corsHeaders = (origin = "*") => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
});

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const origin = request.headers.get("Origin") || "*";

  const WORKER_BASE_URL = env.WORKER_BASE_URL;
  if (!WORKER_BASE_URL) {
    return json({ ok: false, error: "Missing WORKER_BASE_URL in Pages env." }, 500, origin);
  }

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Build upstream path
  // params.path is array or string depending on routing
  const pathParts = Array.isArray(params?.path) ? params.path : [params?.path].filter(Boolean);
  const upstreamPath = "/" + pathParts.join("/");

  const url = new URL(request.url);
  const upstreamUrl = new URL(upstreamPath + url.search, WORKER_BASE_URL).toString();

  // Copy headers (keep Authorization)
  const headers = new Headers();
  headers.set("Accept", request.headers.get("Accept") || "application/json");

  const auth = request.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);

  // Content-Type only when needed
  const ct = request.headers.get("Content-Type") || "";
  if (ct) headers.set("Content-Type", ct);

  let body = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Pass-through body (JSON or others)
    body = await request.arrayBuffer();
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
    });
  } catch (e) {
    return json({ ok: false, error: "Upstream fetch failed", detail: String(e?.message || e) }, 502, origin);
  }

  const resHeaders = new Headers(corsHeaders(origin));
  const upstreamCT = upstreamRes.headers.get("Content-Type") || "application/json";
  resHeaders.set("Content-Type", upstreamCT);

  // Return raw text (so JSON stays JSON even if worker returns non-JSON in edge cases)
  const text = await upstreamRes.text();
  return new Response(text, { status: upstreamRes.status, headers: resHeaders });
}