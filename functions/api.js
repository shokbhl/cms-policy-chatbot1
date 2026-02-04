export async function onRequest(context) {
  const { request } = context;

  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";

  const url = new URL(request.url);

  // forward: /api/...  =>  WORKER_ORIGIN/api/...
  const forwardPath = url.pathname.replace(/^\/api/, "/api");
  const targetUrl = new URL(WORKER_ORIGIN + forwardPath);

  // keep querystring
  targetUrl.search = url.search;

  // clone request with new URL
  const newReq = new Request(targetUrl.toString(), request);

  const res = await fetch(newReq);

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}