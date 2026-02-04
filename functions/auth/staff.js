export async function onRequest(context) {
  const { request } = context;

  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";
  const targetUrl = WORKER_ORIGIN + "/auth/staff";

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST required" }, null, 2), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  const upstreamReq = new Request(targetUrl, request);
  const res = await fetch(upstreamReq);

  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(res.body, { status: res.status, headers });
}