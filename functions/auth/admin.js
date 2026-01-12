export async function onRequest(context) {
  const { request } = context;

  const WORKER_ORIGIN = "https://cms-policy-worker.shokbhl.workers.dev";

  const target = new URL(WORKER_ORIGIN + "/auth/admin");

  const res = await fetch(target.toString(), request);

  return new Response(res.body, {
    status: res.status,
    headers: res.headers
  });
}