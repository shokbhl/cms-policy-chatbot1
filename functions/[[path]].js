// functions/[[path]].js
// Catch-all proxy: forwards ANY path (/api, /auth/*, /handbooks, /policies, /protocols, /admin/* ...)
// to your Worker base URL in env.WORKER_BASE_URL

const corsHeaders = (origin = "*") => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

function pickOrigin(req) {
  return req.headers.get("Origin") || "*";
}

function isBodyAllowed(method) {
  return !["GET", "HEAD"].includes(String(method || "").toUpperCase());
}

function filterUpstreamHeaders(request) {
  // Forward only what we need; avoid hop-by-hop headers
  const h = new Headers();

  const contentType = request.headers.get("Content-Type");
  if (contentType) h.set("Content-Type", contentType);

  const auth = request.headers.get("Authorization");
  if (auth) h.set("Authorization", auth);

  // Optional forwarding
  const accept = request.headers.get("Accept");
  if (accept) h.set("Accept", accept);

  // Helpful debug / origin
  const origin = request.headers.get("Origin");
  if (origin) h.set("Origin", origin);

  // You can forward host info if you want
  const xfHost = request.headers.get("Host");
  if (xfHost) h.set("X-Forwarded-Host", xfHost);

  return h;
}

async function proxy(context) {
  const { request, env } = context;

  const WORKER_BASE = env.WORKER_BASE_URL;
  if (!WORKER_BASE) {
    return new Response(JSON.stringify({ ok: false, error: "Missing WORKER_BASE_URL in Pages env." }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Build upstream URL: keep pathname + search
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, WORKER_BASE).toString();

  const origin = pickOrigin(request);

  // Handle OPTIONS (preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Forward request to Worker
  let body = undefined;
  if (isBodyAllowed(request.method)) {
    // We keep raw body to support JSON and anything else
    const ab = await request.arrayBuffer();
    body = ab.byteLength ? ab : undefined;
  }

  const upstreamRes = await fetch(upstreamUrl, {
    method: request.method,
    headers: filterUpstreamHeaders(request),
    body,
  });

  // Copy response (keep content-type if present)
  const resHeaders = new Headers(corsHeaders(origin));

  const ct = upstreamRes.headers.get("Content-Type");
  if (ct) resHeaders.set("Content-Type", ct);

  // Optional: pass cache headers etc.
  const cacheControl = upstreamRes.headers.get("Cache-Control");
  if (cacheControl) resHeaders.set("Cache-Control", cacheControl);

  const text = await upstreamRes.text();

  return new Response(text, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

export async function onRequest(context) {
  try {
    return await proxy(context);
  } catch (err) {
    const origin = pickOrigin(context.request);
    return new Response(
      JSON.stringify({ ok: false, error: "Proxy error", detail: err?.message || String(err) }, null, 2),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
}