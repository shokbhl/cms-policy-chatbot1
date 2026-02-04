export async function onRequest(context) {
  const { request } = context;

  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";

  const url = new URL(request.url);

  // /api/...  ->  /...
  const forwardPath = url.pathname.replace(/^\/api/, "") || "/";

  const targetUrl = new URL(WORKER_ORIGIN + forwardPath);

  // keep query string
  targetUrl.search = url.search;

  // forward original request (method/body/headers)
  const newReq = new Request(targetUrl.toString(), request);

  const res = await fetch(newReq);

  // return response back to browser
  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}