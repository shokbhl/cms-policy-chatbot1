export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const campus = String(body.campus || "").trim().toUpperCase();
    const token = String(body.token || "").trim();
    const role = String(body.role || "").trim().toLowerCase();

    if (!action) return json({ ok: false, error: "action required" }, 400);

    // some actions may require auth
    const needsAuth = ["ask", "list", "doc_sections", "doc_section_get"].includes(action);
    if (needsAuth) {
      if (!token) return json({ ok: false, error: "Unauthorized (staff/parent token required)" }, 401);
      if (role !== "staff" && role !== "parent") return json({ ok: false, error: "role required" }, 400);

      const session = await verifyToken(env, token);
      if (!session.ok) return json({ ok: false, error: "Unauthorized (invalid/expired token)" }, 401);
      if (session.payload.role !== role) return json({ ok: false, error: "Unauthorized (role mismatch)" }, 401);
    }

    // Parent must NOT access policies/protocols list
    if (action === "list") {
      const source = String(body.source || "").trim().toLowerCase(); // policy | protocol
      if ((source === "policy" || source === "protocol") && role === "parent") {
        return json({ ok: false, error: "Forbidden for parent" }, 403);
      }
    }

    // If you have a Worker, forward everything to Worker /api
    if (env.WORKER_URL) {
      const forward = await fetch(`${env.WORKER_URL}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await forward.json().catch(() => ({}));
      return json(data, forward.status);
    }

    // No Worker => we can return helpful errors (so you know what's missing)
    if (action === "ask") {
      return json({ ok: false, error: "WORKER_URL not set. api.js needs Worker for AI/KB." }, 500);
    }

    return json({ ok: false, error: "WORKER_URL not set. Provide a data source." }, 500);

  } catch (e) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

async function verifyToken(env, token) {
  try {
    const secret = String(env.TOKEN_SECRET || "");
    if (!secret) return { ok: false, error: "TOKEN_SECRET missing" };

    const [data, sig] = String(token).split(".");
    if (!data || !sig) return { ok: false, error: "Bad token format" };

    const expected = await hmac256(secret, data);
    if (sig !== expected) return { ok: false, error: "Bad signature" };

    const payload = JSON.parse(decodeBase64url(data));
    const exp = Number(payload.exp || 0);
    if (!exp || Math.floor(Date.now() / 1000) > exp) return { ok: false, error: "Expired" };

    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid token" };
  }
}

async function hmac256(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64urlBytes(new Uint8Array(signature));
}
function decodeBase64url(b64url) {
  const b64 = b64url.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((b64url.length + 3) % 4);
  const str = atob(b64);
  return decodeURIComponent(escape(str));
}
function base64urlBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
