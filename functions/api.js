// functions/api.js
export async function onRequestPost(context) {
  const { request, env } = context;

  // ✅ IMPORTANT: set this in Pages -> Settings -> Environment variables
  // Example value: https://cms-policy-worker.shokbhl.workers.dev
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

  // Forward to Worker /api endpoint
  const upstreamUrl = new URL("/api", WORKER_BASE).toString();

  const upstreamRes = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // optional: forward origin
      "X-Forwarded-Host": request.headers.get("host") || ""
    },
    body: JSON.stringify(body)
  });

  const text = await upstreamRes.text();
  // return exactly as worker returns
  return new Response(text, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": upstreamRes.headers.get("Content-Type") || "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}