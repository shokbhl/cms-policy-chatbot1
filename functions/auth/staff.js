export async function onRequest(context) {
  const { request, env } = context;

  // CORS / preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const campus = String(body.campus || "").trim().toUpperCase();

    if (!code) return json({ ok: false, error: "Code required" }, 400);
    if (!campus) return json({ ok: false, error: "Campus required" }, 400);

    const staffCode = String(env.STAFF_CODE || "").trim();
    if (!staffCode) return json({ ok: false, error: "STAFF_CODE not set in Pages env" }, 500);

    if (code !== staffCode) return json({ ok: false, error: "Invalid staff code" }, 401);

    const expiresIn = 60 * 60 * 8; // 8 hours
    const token = await signToken(env, { role: "staff", campus, exp: Math.floor(Date.now() / 1000) + expiresIn });

    return json({ ok: true, role: "staff", token, expires_in: expiresIn }, 200);
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

// --- token helpers (HMAC SHA-256) ---
async function signToken(env, payload) {
  const secret = String(env.TOKEN_SECRET || "");
  if (!secret) throw new Error("TOKEN_SECRET not set in Pages env");

  const data = base64url(JSON.stringify(payload));
  const sig = await hmac256(secret, data);
  return `${data}.${sig}`;
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

function base64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function base64urlBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
