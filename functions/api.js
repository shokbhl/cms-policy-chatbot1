export async function onRequest({ request }) {
  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";

  const url = new URL(request.url);

  // remove /api prefix
  const forwardPath = url.pathname.replace(/^\/api/, "") || "/";

  const targetUrl = WORKER_ORIGIN + forwardPath + url.search;

  const newRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  return fetch(newRequest);
}