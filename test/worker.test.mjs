// ============================================================
// CMS Assistant v2 — Worker tests
//
// Run:  node --test test/worker.test.mjs
//
// No dependencies, no network: KV is mocked in-process and the
// OpenAI call is stubbed by swapping globalThis.fetch.
// ============================================================

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import worker from "../worker.js";

// ============================================================
// Mock KV — counts reads and writes so isolation can be asserted
// ============================================================

class MockKV {
  constructor(seed = {}, name = "kv") {
    this.name = name;
    this.store = new Map();
    this.getKeys = [];
    this.writes = [];
    for (const [k, v] of Object.entries(seed)) {
      this.store.set(k, { value: typeof v === "string" ? v : JSON.stringify(v), metadata: null });
    }
  }

  async get(key) {
    this.getKeys.push(key);
    return this.store.get(key)?.value ?? null;
  }

  // Real KV returns the value and its metadata together; feedback needs both
  // so a rating can be attached without discarding the logged record.
  async getWithMetadata(key) {
    this.getKeys.push(key);
    const hit = this.store.get(key);
    return { value: hit?.value ?? null, metadata: hit?.metadata ?? null };
  }

  async put(key, value, opts = {}) {
    this.writes.push(key);
    this.store.set(key, { value: String(value), metadata: opts.metadata ?? null });
  }

  async delete(key) {
    this.writes.push(`DELETE ${key}`);
    this.store.delete(key);
  }

  async list({ prefix = "", limit = 1000, cursor } = {}) {
    const names = [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const slice = names.slice(start, start + limit);
    const end = start + slice.length;
    return {
      keys: slice.map((name) => ({ name, metadata: this.store.get(name).metadata })),
      list_complete: end >= names.length,
      cursor: end >= names.length ? undefined : String(end),
    };
  }
}

// ============================================================
// Fixtures — sized like the real data (18 policies, 12 protocols)
// ============================================================

const STAFF_ONLY_MARKER = "INTERNAL_STAFF_ONLY_MARKER late pickup after 6pm incurs a fee.";

// Mirrors MAX_DOCS_TO_AI in worker.js.
const MAX_DOCS_TO_AI = 12;

const POLICY_INDEX = [
  { id: "safe_arrival", kv_key: "safe_arrival", type: "policy", title: "Safe Arrival and Dismissal Policy", keywords: ["arrival", "dismissal", "pickup", "late pickup"] },
  { id: "anaphylaxis_policy", kv_key: "anaphylaxis_policy", type: "policy", title: "Anaphylaxis Policy", keywords: ["allergy", "anaphylaxis", "epipen"] },
];
for (let i = 0; i < 16; i++) {
  POLICY_INDEX.push({ id: `filler_policy_${i}`, kv_key: `filler_policy_${i}`, type: "policy", title: `Filler Policy ${i}`, keywords: [`unrelated${i}`] });
}

const PROTOCOL_INDEX = [
  { id: "employee_conduct", kv_key: "employee_conduct", type: "protocol", title: "Employee Conduct", keywords: ["conduct", "staff protocol"] },
];
for (let i = 0; i < 11; i++) {
  PROTOCOL_INDEX.push({ id: `filler_protocol_${i}`, kv_key: `filler_protocol_${i}`, type: "protocol", title: `Filler Protocol ${i}`, keywords: [`nothing${i}`] });
}

function seedPolicies() {
  const seed = { policies: POLICY_INDEX };
  seed.safe_arrival = {
    id: "safe_arrival", type: "policy", title: "Safe Arrival and Dismissal Policy",
    keywords: ["arrival", "dismissal", "pickup", "late pickup"],
    content: STAFF_ONLY_MARKER, link: "https://example.org/safe-arrival",
  };
  seed.anaphylaxis_policy = {
    id: "anaphylaxis_policy", type: "policy", title: "Anaphylaxis Policy",
    keywords: ["allergy", "anaphylaxis", "epipen"],
    content: "Staff must administer epinephrine without delay.",
  };
  for (const e of POLICY_INDEX) {
    if (!seed[e.kv_key]) {
      seed[e.kv_key] = { id: e.id, type: "policy", title: e.title, keywords: e.keywords, content: `Body of ${e.title}.` };
    }
  }
  return seed;
}

function seedProtocols() {
  const seed = { protocols: PROTOCOL_INDEX };
  for (const e of PROTOCOL_INDEX) {
    seed[e.kv_key] = { id: e.id, type: "protocol", title: e.title, keywords: e.keywords, content: `Body of ${e.title}.` };
  }
  return seed;
}

const HANDBOOK_YC = [{
  id: "yc_parent_handbook",
  type: "handbook",
  campus: "YC",
  program: "ALL",
  title: "YC Parent Handbook",
  link: "https://example.org/yc-handbook",
  keywords: ["parent handbook"],
  sections: [
    { key: "arrival_dismissal", title: "Arrival and Dismissal", content: "Parents sign children in and out at the front desk." },
    { key: "illness_policy", title: "Illness Policy", content: "Keep your child home for 24 hours after a fever." },
  ],
}];

function makeEnv(overrides = {}) {
  return {
    POLICIES: new MockKV(seedPolicies(), "POLICIES"),
    PROTOCOLS: new MockKV(seedProtocols(), "PROTOCOLS"),
    HANDBOOKS: new MockKV({
      handbook_YC: HANDBOOK_YC,
      // Willowdale under the legacy WD key, to exercise the alias.
      handbook_WD: [{ id: "wd_parent_handbook", campus: "WD", title: "Willowdale Parent Handbook", sections: [] }],
    }, "HANDBOOKS"),
    STATE: new MockKV({}, "STATE"),
    STAFF_CODE: "staff-secret",
    PARENT_CODE: "parent-secret",
    ADMIN_PIN: "1234",
    OPENAI_API_KEY: "test-key",
    ...overrides,
  };
}

// ============================================================
// Harness
// ============================================================

let currentEnv;
let realFetch;
let capturedPrompts = [];
let pending = [];

const ctx = { waitUntil: (p) => pending.push(p) };

async function settle() {
  await Promise.allSettled(pending);
  pending = [];
}

function call(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  return worker.fetch(
    new Request(`https://v2.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    currentEnv,
    ctx
  );
}

async function callJson(path, opts) {
  const res = await call(path, opts);
  return { res, data: await res.json().catch(() => ({})) };
}

function stubOpenAI({ id = "safe_arrival", sectionKey = null, fail = false, raw = null, others = undefined } = {}) {
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("api.openai.com")) return realFetch(url, init);

    capturedPrompts.push(JSON.parse(init.body).messages.map((m) => m.content).join("\n"));
    if (fail) return new Response("boom", { status: 500 });

    const content = raw ?? JSON.stringify({
      id, answer: "Here is the answer.", match_reason: "keyword match", section_key: sectionKey,
      ...(others ? { others } : {}),
    });

    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  };
}

beforeEach(() => {
  currentEnv = makeEnv();
  pending = [];
  capturedPrompts = [];
  realFetch = globalThis.fetch;
  globalThis.__CMS_V2_CACHE = new Map(); // worker memoizes on globalThis
  stubOpenAI();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function login(role = "staff") {
  const body = role === "admin" ? { pin: "1234" } : { code: `${role}-secret` };
  const { data } = await callJson(`/auth/${role}`, { method: "POST", body });
  assert.equal(data.ok, true, `${role} login should succeed`);
  return data.token;
}

// ============================================================
// Isolation from v1 — the property that must never regress
// ============================================================

test("v2 never writes to the shared content namespaces", async () => {
  const staff = await login("staff");
  await callJson("/api", { method: "POST", token: staff, body: { query: "late pickup rules", campus: "YC" } });
  await settle();

  await callJson("/doc?type=policy&id=safe_arrival", { token: staff });
  await callJson("/handbooks?campus=YC", { token: staff });

  const admin = await login("admin");
  await callJson("/admin/stats", { token: admin });
  await callJson("/admin/logs", { token: admin });
  await settle();

  for (const ns of ["POLICIES", "PROTOCOLS", "HANDBOOKS"]) {
    assert.deepEqual(
      currentEnv[ns].writes, [],
      `${ns} must be read-only — v1's data cannot be mutated by v2`
    );
  }
  assert.ok(currentEnv.STATE.writes.length > 0, "v2 state namespace does receive writes");
});

// ============================================================
// Status routes
// ============================================================

test("GET / reports the v2 service", async () => {
  const { res, data } = await callJson("/");
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.service, "cms-assistant-v2");
});

test("GET /health lists all 10 routes", async () => {
  const { data } = await callJson("/health");
  assert.equal(data.ok, true);
  assert.ok(data.version);
  assert.equal(Object.keys(data.routes).length, 10);
});

test("unknown path returns 404", async () => {
  assert.equal((await callJson("/nope")).res.status, 404);
});

test("wrong method on a known route returns 405", async () => {
  assert.equal((await callJson("/api")).res.status, 405);
  assert.equal((await callJson("/handbooks", { method: "POST", body: {} })).res.status, 405);
});

test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const res = await call("/api", { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(res.headers.get("Access-Control-Allow-Headers"), /Authorization/);
});

// ============================================================
// Auth
// ============================================================

test("POST /auth/staff accepts a flat body", async () => {
  const { res, data } = await callJson("/auth/staff", { method: "POST", body: { code: "staff-secret" } });
  assert.equal(res.status, 200);
  assert.equal(data.role, "staff");
  assert.equal(data.expires_in, 28800);
  assert.ok(data.token);
});

test("POST /auth/staff accepts v1's nested body shapes", async () => {
  const nested = await callJson("/auth/staff", { method: "POST", body: { data: { code: "staff-secret" } } });
  assert.equal(nested.data.role, "staff");

  const doubleNested = await callJson("/auth/staff", { method: "POST", body: { data: { data: { code: "staff-secret" } } } });
  assert.equal(doubleNested.data.role, "staff");
});

test("POST /auth/parent and /auth/admin issue their roles", async () => {
  const p = await callJson("/auth/parent", { method: "POST", body: { code: "parent-secret" } });
  assert.equal(p.data.role, "parent");

  const a = await callJson("/auth/admin", { method: "POST", body: { data: { pin: "1234" } } });
  assert.equal(a.data.role, "admin");
});

test("wrong code is 401, missing code is 400, unset secret is 500", async () => {
  assert.equal((await callJson("/auth/staff", { method: "POST", body: { code: "nope" } })).res.status, 401);
  assert.equal((await callJson("/auth/staff", { method: "POST", body: {} })).res.status, 400);

  currentEnv = makeEnv({ STAFF_CODE: "" });
  const { res, data } = await callJson("/auth/staff", { method: "POST", body: { code: "x" } });
  assert.equal(res.status, 500);
  assert.match(data.error, /STAFF_CODE/);
});

test("malformed JSON is rejected with 400", async () => {
  const res = await worker.fetch(
    new Request("https://v2.test/auth/staff", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json",
    }),
    currentEnv, ctx
  );
  assert.equal(res.status, 400);
});

test("auth is rate limited per IP after 10 attempts", async () => {
  let limited = null;
  for (let i = 0; i < 11; i++) {
    const { res } = await callJson("/auth/staff", { method: "POST", body: { code: "wrong" } });
    if (res.status === 429) { limited = i; break; }
  }
  assert.equal(limited, 10, "the 11th attempt is throttled");
});

// ============================================================
// Role isolation — including the v1 /doc gap this release closes
// ============================================================

test("parent token CANNOT read a policy via /doc (v1 allowed this)", async () => {
  const token = await login("parent");
  const { res, data } = await callJson("/doc?type=policy&id=safe_arrival", { token });
  assert.equal(res.status, 401, "v1 used validateAnyToken here, exposing internal policies to parents");
  assert.equal(data.ok, false);
});

test("parent token CANNOT read a protocol via /doc", async () => {
  const token = await login("parent");
  assert.equal((await callJson("/doc?type=protocol&id=employee_conduct", { token })).res.status, 401);
});

test("staff and admin CAN read a policy via /doc", async () => {
  for (const role of ["staff", "admin"]) {
    const token = await login(role);
    const { res, data } = await callJson("/doc?type=policy&id=safe_arrival", { token });
    assert.equal(res.status, 200, `${role} should be allowed`);
    assert.equal(data.doc.title, "Safe Arrival and Dismissal Policy");
  }
});

test("admin token cannot use the chat route", async () => {
  const token = await login("admin");
  const { res } = await callJson("/api", { method: "POST", token, body: { query: "x", campus: "YC" } });
  assert.equal(res.status, 401, "admin mode is for monitoring, not chat");
});

test("staff token cannot read admin stats or logs", async () => {
  const token = await login("staff");
  assert.equal((await callJson("/admin/stats", { token })).res.status, 401);
  assert.equal((await callJson("/admin/logs", { token })).res.status, 401);
});

test("parent sending a policy scope is refused with 403", async () => {
  const token = await login("parent");
  const { res } = await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickup", campus: "YC", scope: { type: "policy", id: "safe_arrival" } },
  });
  assert.equal(res.status, 403);
});

test("internal policy text is never sent to the model for a parent", async () => {
  const token = await login("parent");
  await callJson("/api", { method: "POST", token, body: { query: "late pickup and dismissal", campus: "YC" } });
  await settle();

  const everything = capturedPrompts.join("\n");
  assert.ok(capturedPrompts.length > 0, "the model was called");
  assert.ok(!everything.includes("INTERNAL_STAFF_ONLY_MARKER"), "no policy content in a parent's prompt");
  assert.ok(everything.includes("sign children in and out"), "but handbook content is present");
});

test("a garbage bearer token is rejected everywhere", async () => {
  for (const path of ["/handbooks?campus=YC", "/doc?type=policy&id=safe_arrival", "/admin/logs"]) {
    assert.equal((await callJson(path, { token: "garbage" })).res.status, 401, path);
  }
});

// ============================================================
// /handbooks
// ============================================================

test("GET /handbooks lists handbooks without section bodies", async () => {
  const token = await login("parent");
  const { data } = await callJson("/handbooks?campus=YC", { token });
  assert.equal(data.count, 1);
  assert.equal(data.handbooks[0].sections.length, 2);
  assert.equal(data.handbooks[0].sections[0].content, undefined, "list view omits bodies");
});

test("GET /handbooks returns a full handbook, then a single section", async () => {
  const token = await login("staff");

  const full = await callJson("/handbooks?campus=YC&id=yc_parent_handbook", { token });
  assert.ok(full.data.handbook.sections[0].content.length > 0);

  const one = await callJson("/handbooks?campus=YC&id=yc_parent_handbook&section=illness_policy", { token });
  assert.equal(one.data.section.title, "Illness Policy");
  assert.match(one.data.section.content, /24 hours/);
  assert.equal(one.data.handbook.title, "YC Parent Handbook");
});

test("GET /handbooks falls back from WC to the legacy WD key", async () => {
  const token = await login("parent");
  const { data } = await callJson("/handbooks?campus=WC", { token });
  assert.equal(data.handbooks.length, 1);
  assert.equal(data.handbooks[0].id, "wd_parent_handbook");
});

test("GET /handbooks validates input", async () => {
  const token = await login("parent");
  assert.equal((await callJson("/handbooks", { token })).res.status, 400);
  assert.equal((await callJson("/handbooks?campus=YC&id=ghost", { token })).res.status, 404);
  assert.equal((await callJson("/handbooks?campus=YC&id=yc_parent_handbook&section=ghost", { token })).res.status, 404);
});

// ============================================================
// /doc
// ============================================================

test("GET /doc validates type and id", async () => {
  const token = await login("staff");
  assert.equal((await callJson("/doc?type=handbook&id=x", { token })).res.status, 400);
  assert.equal((await callJson("/doc?type=policy", { token })).res.status, 400);
  assert.equal((await callJson("/doc?type=policy&id=ghost", { token })).res.status, 404);
});

// ============================================================
// /api
// ============================================================

test("POST /api answers and names its source", async () => {
  const token = await login("staff");
  const { res, data } = await callJson("/api", {
    method: "POST", token,
    body: { query: "what is the late pickup rule?", campus: "YC", program: "ALL" },
  });
  await settle();

  assert.equal(res.status, 200);
  assert.equal(data.answer, "Here is the answer.");
  assert.equal(data.source.id, "safe_arrival");
  assert.equal(data.source.type, "policy");
  assert.equal(data.user_role, "staff");
  assert.equal(data.program, "ALL");
});

test("POST /api requires campus and query", async () => {
  const token = await login("staff");
  assert.equal((await callJson("/api", { method: "POST", token, body: { query: "x" } })).res.status, 400);
  assert.equal((await callJson("/api", { method: "POST", token, body: { campus: "YC" } })).res.status, 400);
});

test("POST /api serves a repeat question from cache", async () => {
  const token = await login("staff");
  const body = { query: "identical question about pickup", campus: "YC", program: "ALL" };

  await callJson("/api", { method: "POST", token, body });
  await settle();
  const callsAfterFirst = capturedPrompts.length;

  const second = await callJson("/api", { method: "POST", token, body });
  await settle();

  assert.equal(second.data.cached, true);
  assert.equal(capturedPrompts.length, callsAfterFirst, "the model was not called again");
});

test("POST /api normalizes program aliases", async () => {
  const token = await login("staff");
  const { data } = await callJson("/api", {
    method: "POST", token, body: { query: "pickup", campus: "YC", program: "All Programs" },
  });
  await settle();
  assert.equal(data.program, "ALL");
});

test("POST /api resolves a handbook section answer", async () => {
  stubOpenAI({ id: "yc_parent_handbook", sectionKey: "illness_policy" });
  const token = await login("parent");

  const { data } = await callJson("/api", {
    method: "POST", token, body: { query: "fever, when do I keep my child home?", campus: "YC" },
  });
  await settle();

  assert.equal(data.source.type, "handbook");
  assert.equal(data.handbook_section.section_key, "illness_policy");
  assert.equal(data.handbook_section.section_title, "Illness Policy");
  assert.match(data.handbook_section.section_content, /24 hours/);
});

test("POST /api handles an OpenAI failure and non-JSON output", async () => {
  const token = await login("staff");

  stubOpenAI({ fail: true });
  const failed = await callJson("/api", { method: "POST", token, body: { query: "a", campus: "YC" } });
  await settle();
  assert.equal(failed.res.status, 502);

  stubOpenAI({ raw: "not json at all" });
  const garbage = await callJson("/api", { method: "POST", token, body: { query: "b", campus: "YC" } });
  await settle();
  assert.equal(garbage.res.status, 502);
});

test("POST /api ignores a hallucinated document id", async () => {
  stubOpenAI({ id: "a_document_that_does_not_exist" });
  const token = await login("staff");

  const { data } = await callJson("/api", { method: "POST", token, body: { query: "pickup", campus: "YC" } });
  await settle();

  assert.equal(data.source, null, "an id outside the shortlist is never surfaced");
});

test("POST /api degrades gracefully when a campus has no content", async () => {
  const token = await login("parent");
  const { res, data } = await callJson("/api", { method: "POST", token, body: { query: "x", campus: "ZZ" } });
  await settle();

  assert.equal(res.status, 200);
  assert.equal(data.answer, "");
  assert.match(data.note, /No parent handbook content/);
});

test("POST /api rate limits after 60 requests in a window", async () => {
  const token = await login("staff");
  let limited = null;

  for (let i = 0; i < 61; i++) {
    const { res } = await callJson("/api", { method: "POST", token, body: { query: `q${i}`, campus: "YC" } });
    if (res.status === 429) { limited = i; break; }
  }
  await settle();

  assert.equal(limited, 60, "the 61st request is throttled");
});

// ============================================================
// Efficiency — index-first ranking
// ============================================================

test("an unscoped staff query shortlists policy docs instead of loading all 18", async () => {
  const token = await login("staff");
  const kv = currentEnv.POLICIES;
  kv.getKeys = [];

  await callJson("/api", { method: "POST", token, body: { query: "late pickup dismissal arrival", campus: "YC" } });
  await settle();

  const docReads = kv.getKeys.filter((k) => k !== "policies");
  assert.ok(
    docReads.length <= MAX_DOCS_TO_AI,
    `expected at most the shortlist size (${MAX_DOCS_TO_AI}) doc reads, got ${docReads.length}`
  );
  assert.ok(
    docReads.length < POLICY_INDEX.length,
    `must not load the whole store: read ${docReads.length} of ${POLICY_INDEX.length}`
  );
  assert.ok(docReads.length > 0, "at least one document was loaded");
});

// ------------------------------------------------------------
// Follow-ups. Never inferred — the person asks for one explicitly,
// so a question asked on its own must behave exactly as before.
// ------------------------------------------------------------

test("a follow-up puts the earlier question in front of the model", async () => {
  const token = await login("staff");

  await callJson("/api", {
    method: "POST", token,
    body: {
      query: "until what time?",
      campus: "YC",
      context: { query: "what happens if a parent is late for pickup?", answer: "Staff contact the parent." },
    },
  });
  await settle();

  const prompt = capturedPrompts.join("\n");
  assert.match(prompt, /Earlier question: what happens if a parent is late for pickup\?/);
  assert.match(prompt, /Question: until what time\?/, "the new question is still the one being answered");
});

test("the reply says which question it followed on from", async () => {
  const token = await login("staff");
  const { data } = await callJson("/api", {
    method: "POST", token,
    body: { query: "until what time?", campus: "YC", context: { query: "late pickup dismissal" } },
  });
  await settle();
  assert.equal(data.followed_up_from, "late pickup dismissal");
});

test("a question asked on its own is untouched by this", async () => {
  const token = await login("staff");
  const { data } = await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickup dismissal arrival", campus: "YC" },
  });
  await settle();

  assert.equal(data.followed_up_from, null, "nothing is assumed without being asked");
  const prompt = capturedPrompts.join("\n");
  assert.ok(!prompt.includes("Earlier question:"), "no earlier turn is invented");
});

test("the same words after different questions are cached separately", async () => {
  const token = await login("staff");
  const ask = (context) => callJson("/api", {
    method: "POST", token, body: { query: "until what time?", campus: "YC", context },
  });

  await ask({ query: "late pickup dismissal" });
  await settle();
  const writesAfterFirst = currentEnv.STATE.writes.filter((k) => k.startsWith("ai:")).length;

  await ask({ query: "anaphylaxis epipen allergy" });
  await settle();
  const writesAfterSecond = currentEnv.STATE.writes.filter((k) => k.startsWith("ai:")).length;

  assert.ok(
    writesAfterSecond > writesAfterFirst,
    "the same words in a different conversation must not reuse the first answer"
  );
});

// ------------------------------------------------------------
// Rating an answer. The id is a KV key handed to the caller, so
// the endpoint must refuse anything that is not a log key.
// ------------------------------------------------------------

test("an answer can be rated, and the rating lands on that log entry", async () => {
  const token = await login("staff");

  const { data } = await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickup dismissal arrival", campus: "YC" },
  });
  await settle();

  assert.ok(data.answer_id, "the answer must come back with an id to rate");

  const fb = await callJson("/feedback", {
    method: "POST", token,
    body: { answer_id: data.answer_id, verdict: "bad", note: "missed the deadline" },
  });
  assert.equal(fb.data.ok, true);

  const { data: logs } = await callJson("/admin/logs", { token: await login("admin") });
  const rated = (logs.logs || []).find((l) => l.feedback);
  assert.equal(rated?.feedback, "bad", "the rating must be visible in the logs");
  assert.match(rated.feedback_note, /deadline/);
});

test("feedback cannot be used to overwrite anything that is not a log", async () => {
  const token = await login("staff");
  const before = await currentEnv.STATE.get(`staff:${token}`);
  assert.ok(before, "the session token is stored in the same namespace");

  const fb = await callJson("/feedback", {
    method: "POST", token,
    body: { answer_id: `staff:${token}`, verdict: "good" },
  });

  assert.equal(fb.res.status, 400, "a non-log key must be refused");
  assert.equal(
    await currentEnv.STATE.get(`staff:${token}`), before,
    "and the session token must be untouched"
  );
});

test("a rating for an unknown answer is refused", async () => {
  const token = await login("staff");
  const fb = await callJson("/feedback", {
    method: "POST", token,
    body: { answer_id: "log:0000000000000000:000000:deadbeef", verdict: "good" },
  });
  assert.equal(fb.res.status, 400);
});

test("only good or bad are accepted as verdicts", async () => {
  const token = await login("staff");
  const { data } = await callJson("/api", {
    method: "POST", token, body: { query: "late pickup", campus: "YC" },
  });
  await settle();
  const fb = await callJson("/feedback", {
    method: "POST", token, body: { answer_id: data.answer_id, verdict: "excellent" },
  });
  assert.equal(fb.res.status, 400);
});

// ------------------------------------------------------------
// A policy and a handbook section under the same heading.
// ------------------------------------------------------------

test("the fuller version of a topic is sent ahead of the summary", async () => {
  const token = await login("staff");

  // The handbook section and the policy share a heading, as they do in the real
  // data: the policy carries the procedure, the handbook only summarises it.
  const policies = seedPolicies();
  policies.safe_arrival = {
    ...policies.safe_arrival,
    title: "Safe Arrival and Dismissal Policy",
    content: "THE_ACTUAL_PROCEDURE contact the parent no later than 10:00 am. " + "detail. ".repeat(400),
  };
  currentEnv.POLICIES = new MockKV(policies, "POLICIES");

  const book = JSON.parse(JSON.stringify(HANDBOOK_YC));
  const first = Array.isArray(book) ? book[0] : book;
  first.sections = [
    { key: "safe_arrival", title: "Safe Arrival and Dismissal Policy",
      content: "The school will make reasonable efforts to contact the parents." },
    ...(first.sections || []),
  ];
  currentEnv.HANDBOOKS = new MockKV({ handbook_YC: book }, "HANDBOOKS");

  await callJson("/api", {
    method: "POST", token,
    body: { query: "safe arrival dismissal what should we do", campus: "YC" },
  });
  await settle();

  const prompt = capturedPrompts.join("\n");
  const policyAt = prompt.indexOf("THE_ACTUAL_PROCEDURE");
  const summaryAt = prompt.indexOf("reasonable efforts to contact the parents");
  assert.ok(policyAt >= 0, "the policy carrying the procedure must be sent");
  if (summaryAt >= 0) {
    assert.ok(
      policyAt < summaryAt,
      "the procedure must come before the summary, or the model answers from the summary"
    );
  }
});

// ------------------------------------------------------------
// Documents that disagree. Staff must see every version with its
// own source, not whichever one the model happened to pick.
// ------------------------------------------------------------

test("a second document that answers differently is returned with its own source", async () => {
  const token = await login("staff");
  stubOpenAI({
    id: "safe_arrival",
    others: [{ id: "anaphylaxis_policy", section_key: null, says: "This one sets a different rule." }],
  });

  // The query must actually retrieve both, or the second is dropped for the
  // same reason an invented one is: it was never offered to the model.
  const { data } = await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickup dismissal arrival anaphylaxis epipen allergy", campus: "YC" },
  });
  await settle();

  assert.equal(data.also_says?.length, 1, "the differing document must be reported");
  assert.equal(data.also_says[0].id, "anaphylaxis_policy");
  assert.equal(data.also_says[0].title, "Anaphylaxis Policy", "it carries its own source title");
  assert.match(data.also_says[0].says, /different rule/);
});

test("the handbook's shorter telling of the same topic is surfaced without being asked", async () => {
  const token = await login("staff");

  const policies = seedPolicies();
  policies.safe_arrival = {
    ...policies.safe_arrival,
    title: "Safe Arrival and Dismissal Policy",
    content: "Contact the parent no later than 10:00 am. " + "procedure detail. ".repeat(300),
  };
  currentEnv.POLICIES = new MockKV(policies, "POLICIES");

  const book = JSON.parse(JSON.stringify(HANDBOOK_YC));
  const first = Array.isArray(book) ? book[0] : book;
  first.sections = [
    { key: "safe_arrival", title: "Safe Arrival and Dismissal Policy",
      content: "The school will make reasonable efforts to contact the parents." },
    ...(first.sections || []),
  ];
  currentEnv.HANDBOOKS = new MockKV({ handbook_YC: book }, "HANDBOOKS");

  // The model reports nothing extra — a summary that merely omits the deadline
  // reads to it as the same thing, which is exactly when the reader needs both.
  stubOpenAI({ id: "safe_arrival", others: [] });

  const { data } = await callJson("/api", {
    method: "POST", token,
    body: { query: "safe arrival dismissal what should we do", campus: "YC" },
  });
  await settle();

  const hb = (data.also_says || []).find((o) => o.type === "handbook");
  assert.ok(hb, "the handbook version of the same topic must be shown alongside");
  assert.match(hb.says, /reasonable efforts/, "and must carry what that document actually says");
});

test("a differing document the caller may not see is dropped", async () => {
  // A parent must not be shown a staff-only policy just because the model
  // named it, exactly as with the primary source.
  const token = await login("parent");
  stubOpenAI({
    id: null,
    others: [{ id: "safe_arrival", section_key: null, says: "internal staff wording" }],
  });

  const { data } = await callJson("/api", {
    method: "POST", token,
    body: { query: "pickup", campus: "YC" },
  });
  await settle();

  assert.equal((data.also_says || []).length, 0, "a staff policy must never leak to a parent");
});

test("a document the model invents is not reported", async () => {
  const token = await login("staff");
  stubOpenAI({
    id: "safe_arrival",
    others: [{ id: "does_not_exist", section_key: null, says: "made up" }],
  });

  const { data } = await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickup dismissal arrival", campus: "YC" },
  });
  await settle();

  assert.equal((data.also_says || []).length, 0, "only documents actually provided may be surfaced");
});

// ------------------------------------------------------------
// Prompt budget. A real policy runs past 6000 characters and the
// operative detail ("no later than 10:00 am") sits well past the
// old 4000-character clamp, so a top-ranked document must be sent
// far enough in for its procedure to survive.
// ------------------------------------------------------------

test("a top-ranked document keeps its procedure instead of being clipped short", async () => {
  const token = await login("staff");

  // Rebuild the store with a safe_arrival policy long enough to be clipped,
  // and a marker sitting where the real 10:00 am rule sits.
  const policies = seedPolicies();
  policies.safe_arrival = {
    ...policies.safe_arrival,
    content:
      "Safe arrival preamble. " + "filler sentence about arrival and dismissal. ".repeat(120) +
      "DEEP_PROCEDURE_MARKER staff must contact the parent no later than 10:00 am. " +
      "trailing text. ".repeat(80),
  };
  currentEnv.POLICIES = new MockKV(policies, "POLICIES");

  await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickup dismissal arrival safe", campus: "YC" },
  });
  await settle();

  const prompt = capturedPrompts.join("\n");
  assert.ok(
    prompt.includes("DEEP_PROCEDURE_MARKER"),
    "the operative step sits ~5000 characters in and must still reach the model"
  );
});

// ------------------------------------------------------------
// Typo tolerance and phrasing — the failures seen in production,
// where "did not show up" and "achild" sent the right policy out
// of the shortlist entirely.
// ------------------------------------------------------------

test("a misspelled query still reaches the right policy", async () => {
  const token = await login("staff");
  await callJson("/api", {
    method: "POST", token,
    body: { query: "anaphlaxis emergancy epipen", campus: "YC" },
  });
  await settle();

  assert.ok(
    capturedPrompts.join("\n").includes("Anaphylaxis Policy"),
    "single-letter typos must not hide the matching policy"
  );
});

test("a missing space between words still matches", async () => {
  const token = await login("staff");
  await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickupand dismissal", campus: "YC" },
  });
  await settle();

  assert.ok(
    capturedPrompts.join("\n").includes("Safe Arrival and Dismissal Policy"),
    "a run-together word must still match the keyword it contains"
  );
});

test("everyday phrasing matches the document's own vocabulary", async () => {
  const token = await login("staff");
  // Staff say "pick up"; the policy keyword is the single word "pickup".
  await callJson("/api", {
    method: "POST", token,
    body: { query: "a parent was late to pick up their child", campus: "YC" },
  });
  await settle();

  assert.ok(
    capturedPrompts.join("\n").includes("Safe Arrival and Dismissal Policy"),
    "spacing differences must not decide whether a policy is found"
  );
});

test("index-first ranking still finds the keyword-matching policy", async () => {
  const token = await login("staff");
  await callJson("/api", { method: "POST", token, body: { query: "anaphylaxis epipen allergy", campus: "YC" } });
  await settle();

  const prompt = capturedPrompts.join("\n");
  assert.ok(prompt.includes("Anaphylaxis Policy"), "relevant policy survived the shortlist");
  assert.ok(prompt.includes("administer epinephrine"), "and its full body was loaded");
});

test("handbook sections are ranked individually, not as one blob", async () => {
  const token = await login("parent");
  await callJson("/api", { method: "POST", token, body: { query: "illness fever", campus: "YC" } });
  await settle();

  const prompt = capturedPrompts.join("\n");
  assert.ok(prompt.includes("Section key: illness_policy"), "sections carry their own key");
  assert.ok(prompt.includes("Section title: Illness Policy"));
});

// Mirrors the real CMS data: the index carries only id/title/kv_key, while
// the rich keywords live on the documents themselves.
function envWithKeywordlessIndex() {
  const policies = seedPolicies();
  policies.policies = POLICY_INDEX.map(({ id, kv_key, type, title }) => ({ id, kv_key, type, title }));
  const env = makeEnv();
  env.POLICIES = new MockKV(policies, "POLICIES");
  return env;
}

test("finds the right policy even when the index has no keywords", async () => {
  currentEnv = envWithKeywordlessIndex();
  const token = await login("staff");

  // "late pickup" appears in safe_arrival's keywords but NOT in any title,
  // so a title-only shortlist would miss it entirely.
  await callJson("/api", {
    method: "POST", token,
    body: { query: "what happens if a parent is late for pickup?", campus: "YC" },
  });
  await settle();

  const prompt = capturedPrompts.join("\n");
  assert.ok(
    prompt.includes("Safe Arrival and Dismissal Policy"),
    "the keyword-matching policy must still reach the model"
  );
});

test("a keyword-rich index still uses the cheap index-first path", async () => {
  const token = await login("staff");
  const kv = currentEnv.POLICIES;
  kv.getKeys = [];

  await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickup dismissal arrival", campus: "YC" },
  });
  await settle();

  // The point is that the index-first path shortlists before fetching bodies,
  // instead of expanding the whole store the way v1 did. The bound is the
  // shortlist size, so assert against that rather than a fixed document count.
  const docReads = kv.getKeys.filter((k) => k !== "policies");
  assert.ok(
    docReads.length < POLICY_INDEX.length,
    `must not expand the whole store: read ${docReads.length} of ${POLICY_INDEX.length}`
  );
  assert.ok(
    docReads.length <= MAX_DOCS_TO_AI,
    `expected at most the shortlist size (${MAX_DOCS_TO_AI}), got ${docReads.length}`
  );
});

test("a scoped request loads exactly one document", async () => {
  const token = await login("staff");
  const kv = currentEnv.POLICIES;
  kv.getKeys = [];

  await callJson("/api", {
    method: "POST", token,
    body: { query: "late pickup", campus: "YC", scope: { type: "policy", id: "safe_arrival" } },
  });
  await settle();

  assert.deepEqual(kv.getKeys.filter((k) => k !== "policies"), ["safe_arrival"]);
});

// ============================================================
// Admin
// ============================================================

test("GET /admin/logs returns newest-first records from list metadata", async () => {
  const staff = await login("staff");
  await callJson("/api", { method: "POST", token: staff, body: { query: "first question", campus: "YC" } });
  await settle();
  await callJson("/api", { method: "POST", token: staff, body: { query: "second question", campus: "MC" } });
  await settle();

  const admin = await login("admin");
  currentEnv.STATE.getKeys = [];
  const { data } = await callJson("/admin/logs?limit=50", { token: admin });

  assert.equal(data.logs.length, 2);
  assert.equal(data.logs[0].query, "second question", "newest first");
  assert.equal(data.logs[0].campus, "MC");

  const logValueReads = currentEnv.STATE.getKeys.filter((k) => k.startsWith("log:"));
  assert.deepEqual(logValueReads, [], "log bodies come from list metadata, not value reads");
});

test("GET /admin/stats has no ok/ok_count collision (v1 bug)", async () => {
  const staff = await login("staff");
  for (const campus of ["YC", "YC", "MC"]) {
    await callJson("/api", { method: "POST", token: staff, body: { query: `q ${Math.random()}`, campus } });
    await settle();
  }

  const admin = await login("admin");
  const { data } = await callJson("/admin/stats", { token: admin });

  assert.equal(data.ok, true, "envelope flag stays boolean");
  assert.equal(typeof data.ok_count, "number", "success count is a separate numeric field");
  assert.equal(data.total, 3);
  assert.equal(data.ok_count + data.bad, data.total, "counts reconcile");

  assert.equal(data.byCampus.YC.total, 2);
  assert.equal(data.byCampus.MC.total, 1);
  assert.equal(data.byRole.staff.total, 3);
  assert.ok(data.byRole.parent, "parent bucket present even at zero");
  assert.equal(data.byRole.parent.total, 0);
  assert.ok(["OK", "WARN", "BAD"].includes(data.badge));
});

test("GET /admin/stats stays truthy when there is no traffic at all", async () => {
  const admin = await login("admin");
  const { data } = await callJson("/admin/stats", { token: admin });

  assert.equal(data.ok, true, "v1 threw 'Failed to load stats' in exactly this case");
  assert.equal(data.total, 0);
  assert.equal(data.ok_count, 0);
  assert.equal(data.badge, "OK");
});
