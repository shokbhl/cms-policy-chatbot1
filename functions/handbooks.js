export async function onRequest({ request }) {
  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";

  const incomingUrl = new URL(request.url);
  const target = new URL(WORKER_ORIGIN + "/handbooks");

  // forward query params: ?campus=YC&id=...&section=...
  target.search = incomingUrl.search;

  const upstreamReq = new Request(target.toString(), request);
  const res = await fetch(upstreamReq);

  return new Response(res.body, {
    status: res.status,
    headers: res.headers
  });
}