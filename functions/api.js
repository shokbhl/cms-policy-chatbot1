// /functions/api.js
// Cloudflare Pages Function
// Proxies:  /api  ->  https://cms-policy-worker.shokbhl.workers.dev/api

export async function onRequest(context) {
  const { request } = context;

  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";

  const url = new URL(request.url);

  // This function handles ONLY /api
  // (Pages Functions route = /api)
  const target = new URL(WORKER_ORIGIN + "/api");

  // Keep querystring if any (rare for /api, but safe)
  target.search = url.search;

  // ---- CORS preflight ----
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }

  // Allow only what your Worker expects
  if (request.method !== "POST") {
    return json(
      { ok: false, error: "Method Not Allowed. Use POST /api" },
      405,
      request
    );
  }

  // ---- Forward headers (keep Authorization + Content-Type) ----
  const headers = new Headers();

  // Only forward safe headers you need
  const auth = request.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);

  const ct = request.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);

  // Optional: forward accept-language for better responses
  const al = request.headers.get("Accept-Language");
  if (al) headers.set("Accept-Language", al);

  // ---- Forward body ----
  // IMPORTANT: request.body can be consumed only once
  const body = request.body;

  // ---- Call Worker ----
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

  // ---- Return response with added CORS ----
  const respHeaders = new Headers(upstream.headers);

  // Make sure CORS headers exist (browser)
  const ch = corsHeaders(request);
  for (const [k, v] of ch.entries()) respHeaders.set(k, v);

  // Ensure JSON is readable in browser
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
  // If you want strict domain, replace "*" with your Pages domain.
  // Example: https://cms-policy-chatbot.pages.dev
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