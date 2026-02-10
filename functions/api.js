// functions/api.js

const corsHeaders = (origin = "*") => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
});

export async function onRequestOptions(context) {
  // Preflight
  const origin = context.request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const WORKER_BASE = env.WORKER_BASE_URL;
  if (!WORKER_BASE) {
    return json({ ok: false, error: "Missing WORKER_BASE_URL in Pages env." }, 500);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const upstreamUrl = new URL("/api", WORKER_BASE).toString();

  const upstreamRes = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = upstreamRes.headers.get("Content-Type") || "application/json";
  const text = await upstreamRes.text();

  const origin = request.headers.get("Origin") || "*";

  return new Response(text, {
    status: upstreamRes.status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": contentType,
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}