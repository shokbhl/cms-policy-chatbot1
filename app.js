// =====================
// CONFIG
// =====================
const API_BASE = "https://cms-policy-worker.YOUR_SUBDOMAIN.workers.dev"; 
// 🔴 اینو با URL Worker خودت عوض کن

// =====================
// STATE
// =====================
const state = {
  token: localStorage.getItem("cms_token") || "",
  role: localStorage.getItem("cms_role") || "",
  campus: localStorage.getItem("cms_campus") || ""
};

// =====================
// ELEMENTS
// =====================
const $ = (id) => document.getElementById(id);

const toastEl = $("toast");
const rolePill = $("rolePill");
const campusPill = $("campusPill");
const logoutBtn = $("logoutBtn");

const campusSelect = $("campusSelect");

const parentCode = $("parentCode");
const staffCode = $("staffCode");
const adminPin = $("adminPin");

const parentLoginBtn = $("parentLoginBtn");
const staffLoginBtn = $("staffLoginBtn");
const adminLoginBtn = $("adminLoginBtn");

const loadHandbooksBtn = $("loadHandbooksBtn");
const handbookSelect = $("handbookSelect");
const sectionSelect = $("sectionSelect");
const loadSectionBtn = $("loadSectionBtn");
const handbookOutput = $("handbookOutput");

const questionInput = $("questionInput");
const askBtn = $("askBtn");
const answerBox = $("answerBox");
const accessHint = $("accessHint");

const loadStatsBtn = $("loadStatsBtn");
const loadLogsBtn = $("loadLogsBtn");
const statsBox = $("statsBox");
const logsBox = $("logsBox");

// =====================
// INIT
// =====================
initTabs();
syncUI();

// campus dropdown
if (state.campus) campusSelect.value = state.campus;
campusSelect.addEventListener("change", () => {
  state.campus = (campusSelect.value || "").toUpperCase();
  localStorage.setItem("cms_campus", state.campus);
  syncUI();
});

// logout
logoutBtn.addEventListener("click", () => {
  state.token = "";
  state.role = "";
  localStorage.removeItem("cms_token");
  localStorage.removeItem("cms_role");
  toast("Logged out.");
  syncUI();
});

// login buttons
parentLoginBtn.addEventListener("click", () => login("parent"));
staffLoginBtn.addEventListener("click", () => login("staff"));
adminLoginBtn.addEventListener("click", () => login("admin"));

// handbook
loadHandbooksBtn.addEventListener("click", loadHandbooks);
loadSectionBtn.addEventListener("click", loadSection);

// ask
askBtn.addEventListener("click", askQuestion);
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") askQuestion();
});

// admin
loadStatsBtn.addEventListener("click", loadStats);
loadLogsBtn.addEventListener("click", loadLogs);

// =====================
// UI helpers
// =====================
function toast(msg, ok = true) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = "toast show " + (ok ? "ok" : "bad");
  setTimeout(() => {
    toastEl.className = "toast";
    toastEl.textContent = "";
  }, 2600);
}

function syncUI() {
  rolePill.textContent = `Role: ${state.role || "—"}`;
  campusPill.textContent = `Campus: ${state.campus || "—"}`;

  // access hint
  if (state.role === "parent") {
    accessHint.textContent = "Parent users will only receive answers from Parent Handbook.";
  } else if (state.role === "staff") {
    accessHint.textContent = "Staff users can receive answers from Policies, Protocols, and Parent Handbook.";
  } else if (state.role === "admin") {
    accessHint.textContent = "Admin can view logs/stats and also test the assistant.";
  } else {
    accessHint.textContent = "";
  }

  // enable/disable admin buttons
  const isAdmin = state.role === "admin";
  loadStatsBtn.disabled = !isAdmin;
  loadLogsBtn.disabled = !isAdmin;

  // disable handbook/ask if not logged in
  const loggedIn = !!state.token;
  loadHandbooksBtn.disabled = !loggedIn;
  loadSectionBtn.disabled = !loggedIn;
  askBtn.disabled = !loggedIn;

  if (!loggedIn) {
    answerBox.innerHTML = `<div class="muted">Please login first.</div>`;
  }
}

// =====================
// API helpers
// =====================
function authHeaders() {
  const h = { "Content-Type": "application/json" };
  if (state.token) h["Authorization"] = `Bearer ${state.token}`;
  return h;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.detail || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// =====================
// LOGIN
// =====================
async function login(kind) {
  if (!state.campus && kind !== "admin") {
    toast("Please select campus first.", false);
    return;
  }

  try {
    let path = "";
    let payload = {};

    if (kind === "parent") {
      path = "/auth/parent";
      payload = { code: (parentCode.value || "").trim() };
    }
    if (kind === "staff") {
      path = "/auth/staff";
      payload = { code: (staffCode.value || "").trim() };
    }
    if (kind === "admin") {
      path = "/auth/admin";
      payload = { pin: (adminPin.value || "").trim() };
    }

    if (Object.values(payload)[0] === "") {
      toast("Please enter the access code / PIN.", false);
      return;
    }

    const data = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    state.token = data.token;
    state.role = data.role;

    localStorage.setItem("cms_token", state.token);
    localStorage.setItem("cms_role", state.role);

    toast(`Logged in as ${state.role}.`);
    syncUI();
  } catch (e) {
    toast(e.message, false);
  }
}

// =====================
// HANDBOOK
// =====================
async function loadHandbooks() {
  if (!state.campus) {
    toast("Select campus first.", false);
    return;
  }

  try {
    handbookOutput.innerHTML = `<div class="muted">Loading…</div>`;
    handbookSelect.innerHTML = `<option value="">Select handbook…</option>`;
    sectionSelect.innerHTML = `<option value="">Select section…</option>`;

    const data = await apiFetch(`/handbooks?campus=${encodeURIComponent(state.campus)}`, {
      method: "GET",
      headers: authHeaders()
    });

    const list = data.handbooks || [];
    if (!list.length) {
      handbookOutput.innerHTML = `<div class="muted">No handbooks found for campus ${state.campus}.</div>`;
      return;
    }

    for (const hb of list) {
      const opt = document.createElement("option");
      opt.value = hb.id;
      opt.textContent = hb.title;
      opt.dataset.sections = JSON.stringify(hb.sections || []);
      handbookSelect.appendChild(opt);
    }

    handbookOutput.innerHTML = `<div class="okText">Loaded ${list.length} handbook(s).</div>`;

    handbookSelect.addEventListener("change", () => {
      sectionSelect.innerHTML = `<option value="">Select section…</option>`;
      const sel = handbookSelect.options[handbookSelect.selectedIndex];
      const secs = JSON.parse(sel.dataset.sections || "[]");
      for (const s of secs) {
        const o = document.createElement("option");
        o.value = s.key;
        o.textContent = s.title || s.key;
        sectionSelect.appendChild(o);
      }
    }, { once: true });

  } catch (e) {
    handbookOutput.innerHTML = `<div class="badText">${e.message}</div>`;
  }
}

async function loadSection() {
  if (!state.campus) return toast("Select campus first.", false);
  const hbId = handbookSelect.value;
  const secKey = sectionSelect.value;
  if (!hbId || !secKey) return toast("Select handbook & section.", false);

  try {
    handbookOutput.innerHTML = `<div class="muted">Loading section…</div>`;
    const data = await apiFetch(
      `/handbooks?campus=${encodeURIComponent(state.campus)}&id=${encodeURIComponent(hbId)}&section=${encodeURIComponent(secKey)}`,
      { method: "GET", headers: authHeaders() }
    );

    const sec = data.section;
    handbookOutput.innerHTML = `
      <div class="section">
        <h3>${escapeHtml(sec.title || sec.key)}</h3>
        <pre class="pre">${escapeHtml(sec.content || "")}</pre>
      </div>
    `;
  } catch (e) {
    handbookOutput.innerHTML = `<div class="badText">${e.message}</div>`;
  }
}

// =====================
// ASK
// =====================
async function askQuestion() {
  if (!state.campus) return toast("Select campus first.", false);
  const q = (questionInput.value || "").trim();
  if (!q) return toast("Type a question.", false);

  try {
    answerBox.innerHTML = `<div class="muted">Thinking…</div>`;

    const data = await apiFetch("/api", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ campus: state.campus, query: q })
    });

    const src = data.source
      ? `<div class="meta">Source: <b>${escapeHtml(data.source.title || data.source.id)}</b> (${escapeHtml(data.source.type)})</div>`
      : `<div class="meta muted">Source: —</div>`;

    const sec = data.handbook_section?.section_title
      ? `<div class="meta">Section: <b>${escapeHtml(data.handbook_section.section_title)}</b></div>`
      : "";

    answerBox.innerHTML = `
      <div class="answer">
        <div class="answerText">${escapeHtml(data.answer || "")}</div>
        ${src}
        ${sec}
        <div class="meta muted small">${escapeHtml(data.match_reason || "")}</div>
      </div>
    `;
  } catch (e) {
    answerBox.innerHTML = `<div class="badText">${e.message}</div>`;
  }
}

// =====================
// ADMIN
// =====================
async function loadStats() {
  if (state.role !== "admin") return toast("Admin only.", false);

  try {
    statsBox.textContent = "Loading…";
    const data = await apiFetch("/admin/stats?limit=200", {
      method: "GET",
      headers: authHeaders()
    });
    statsBox.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    statsBox.textContent = e.message;
  }
}

async function loadLogs() {
  if (state.role !== "admin") return toast("Admin only.", false);

  try {
    logsBox.innerHTML = `<div class="muted">Loading…</div>`;
    const data = await apiFetch("/admin/logs?limit=120", {
      method: "GET",
      headers: authHeaders()
    });

    const logs = data.logs || [];
    if (!logs.length) {
      logsBox.innerHTML = `<div class="muted">No logs yet. (Call /api at least once.)</div>`;
      return;
    }

    logsBox.innerHTML = logs.map((l) => {
      const dt = new Date(l.ts || Date.now()).toLocaleString();
      return `
        <div class="logRow">
          <div class="logTop">
            <span class="tag">${escapeHtml(dt)}</span>
            <span class="tag">${escapeHtml(l.campus || "")}</span>
            <span class="tag">${escapeHtml(l.user_role || "")}</span>
            <span class="tag ${l.ok ? "okTag" : "badTag"}">${l.ok ? "OK" : "BAD"}</span>
            <span class="tag">${escapeHtml(String(l.ms || 0))} ms</span>
          </div>
          <div class="logQ">${escapeHtml(l.query || "")}</div>
          <div class="logMeta muted small">
            type=${escapeHtml(l.source_type || "-")} id=${escapeHtml(l.source_id || "-")} section=${escapeHtml(l.section_key || "-")}
          </div>
        </div>
      `;
    }).join("");
  } catch (e) {
    logsBox.innerHTML = `<div class="badText">${e.message}</div>`;
  }
}

// =====================
// Tabs
// =====================
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const name = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("show"));
      document.getElementById(`tab-${name}`).classList.add("show");
    });
  });
}

// =====================
// Utils
// =====================
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}