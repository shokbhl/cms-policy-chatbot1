export async function onRequest(context) {
  const { request } = context;

  // Worker base
  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";

  // This function handles ONLY /api
  const url = new URL(request.url);
  const target = new URL(WORKER_ORIGIN + "/api");

  // Forward request as-is
  const res = await fetch(target.toString(), request);

  // Return response (same-origin to browser)
  return new Response(res.body, {
    status: res.status,
    headers: res.headers
  });
}
