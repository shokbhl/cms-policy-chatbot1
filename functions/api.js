// functions/api.js  (Cloudflare Pages Functions)
// Proxies /api -> Worker /api

export async function onRequest(context) {
  const { request } = context;

  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";

  // Only handle /api
  const url = new URL(request.url);
  if (url.pathname !== "/api") {
    return new Response("Not found", { status: 404 });
  }

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  // Build target URL (keep query params if any)
  const target = new URL(WORKER_ORIGIN + "/api");
  target.search = url.search; // forward query string if present

  // Forward the request as-is (method/body/headers)
  // BUT ensure Host is not set incorrectly by cloning headers
  const reqHeaders = new Headers(request.headers);

  // Optional: ensure JSON content-type for POST if missing
  // (safe for your use case; comment out if you prefer strict passthrough)
  if (request.method === "POST" && !reqHeaders.get("Content-Type")) {
    reqHeaders.set("Content-Type", "application/json");
  }

  const upstreamReq = new Request(target.toString(), {
    method: request.method,
    headers: reqHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? null : request.body
  });

  const upstreamRes = await fetch(upstreamReq);

  // Copy upstream headers safely
  const outHeaders = new Headers(upstreamRes.headers);

  // Add/override CORS (so browser accepts same-origin proxy response)
  const cors = corsHeaders();
  for (const [k, v] of Object.entries(cors)) outHeaders.set(k, v);

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
