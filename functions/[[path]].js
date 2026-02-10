// functions/[[path]].js
// Catch-all proxy: forwards ANY route/method to your Worker, preserving path + query.
// Requires Pages env var: WORKER_BASE_URL = https://your-worker.yourname.workers.dev

const corsHeaders = (origin = "*") => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;

  const origin = request.headers.get("Origin") || "*";

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const WORKER_BASE = env.WORKER_BASE_URL;
  if (!WORKER_BASE) {
    return json({ ok: false, error: "Missing WORKER_BASE_URL in Pages env." }, 500, origin);
  }

  // Build upstream URL:
  // params.path is an array of path segments captured by [[path]]
  const path = Array.isArray(params?.path) ? params.path.join("/") : "";
  const incomingUrl = new URL(request.url);

  // Forward to: WORKER_BASE + "/" + path + "?sameQuery"
  const upstreamUrl = new URL(`/${path}`, WORKER_BASE);
  upstreamUrl.search = incomingUrl.search;

  // Copy request headers (keep Authorization!)
  const headers = new Headers(request.headers);

  // Ensure Host doesn't confuse upstream
  headers.delete("host");

  let body = undefined;
  // Only forward body on non-GET/HEAD
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body,
    });
  } catch (e) {
    return json({ ok: false, error: `Upstream fetch failed: ${String(e.message || e)}` }, 502, origin);
  }

  // Read upstream response as bytes and pass through
  const resHeaders = new Headers(upstreamRes.headers);

  // Add CORS on top
  for (const [k, v] of Object.entries(corsHeaders(origin))) resHeaders.set(k, v);

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}