// functions/api.js
const corsHeaders = (origin = "*") => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

export async function onRequestOptions(context) {
  const origin = context.request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const WORKER_BASE = env.WORKER_BASE_URL;
  if (!WORKER_BASE) {
    return new Response(JSON.stringify({ ok: false, error: "Missing WORKER_BASE_URL in Pages env." }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read body safely (raw)
  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid request body" }, null, 2), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstreamUrl = new URL("/api", WORKER_BASE).toString();

  const upstreamRes = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      ...(request.headers.get("Authorization")
        ? { Authorization: request.headers.get("Authorization") }
        : {}),
    },
    body: bodyText,
  });

  const origin = request.headers.get("Origin") || "*";
  const contentType = upstreamRes.headers.get("Content-Type") || "application/json";
  const text = await upstreamRes.text();

  return new Response(text, {
    status: upstreamRes.status,
    headers: { ...corsHeaders(origin), "Content-Type": contentType },
  });
}