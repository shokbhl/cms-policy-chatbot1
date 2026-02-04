// /functions/auth/admin.js
// Cloudflare Pages Function
// Proxies:  /auth/admin  ->  https://cms-policy-worker.shokbhl.workers.dev/auth/admin

export async function onRequest(context) {
  const { request } = context;

  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";
  const url = new URL(request.url);

  // Pages Functions file path already maps to /auth/admin
  const target = new URL(WORKER_ORIGIN + "/auth/admin");

  // Keep querystring if ever used (usually not)
  target.search = url.search;

  // ---- CORS preflight ----
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }

  // Worker expects POST only
  if (request.method !== "POST") {
    return json(
      { ok: false, error: "Method Not Allowed. Use POST /auth/admin" },
      405,
      request
    );
  }

  // ---- Forward headers (Content-Type) ----
  const headers = new Headers();

  const ct = request.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);

  const al = request.headers.get("Accept-Language");
  if (al) headers.set("Accept-Language", al);

  // ---- Forward body ----
  const body = request.body;

  // ---- Fetch upstream ----
  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: "POST",
      headers,
      body
    });
  } catch (err) {
    return json(
      { ok: false, error: "Upstream fetch failed", detail: String(err?.message || err) },
      502,
      request
    );
  }

  // ---- Return response with CORS ----
  const respHeaders = new Headers(upstream.headers);

  const ch = corsHeaders(request);
  for (const [k, v] of ch.entries()) respHeaders.set(k, v);

  if (!respHeaders.get("Content-Type")) {
    respHeaders.set("Content-Type", "application/json");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders
  });
}

// -------------------- helpers --------------------

function corsHeaders(request) {
  // You can lock this down to your Pages domain later
  const origin = request.headers.get("Origin") || "*";

  return new Headers({
    "Access-Control-Allow-Origin": origin === "null" ? "*" : origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  });
}

function json(obj, status = 200, request) {
  const h = corsHeaders(request || new Request("http://local"));
  h.set("Content-Type", "application/json");

  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: h
  });
}