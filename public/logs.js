// ============================================================
// CMS Assistant v2 — logs.js
// External script only. Ids below match logs.html exactly.
// ============================================================

// Served from localhost -> talk to `wrangler dev`; otherwise the deployed Worker.
const WORKER_BASE =
  ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://cms-assistant-v2.shokbhl.workers.dev";
const LOGS_URL = `${WORKER_BASE}/admin/logs?limit=200`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;

const LS = { adminToken: "cms2_admin_token", adminUntil: "cms2_admin_until" };

const $ = (id) => document.getElementById(id);

const tbody = $("tbody");
const statusText = $("status-text");
const countPill = $("count-pill");
const errorBox = $("error-box");
const searchInput = $("search-input");
const campusSelect = $("campus-select");
const roleSelect = $("role-select");
const sourceSelect = $("source-select");
const onlyErrors = $("only-errors");
const refreshBtn = $("refresh-btn");

let ALL = [];

// ============================================================
// Helpers
// ============================================================

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtTime(ts) {
  const d = new Date(Number(ts || 0));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const role = (l) => (l.user_role || l.role || "").trim().toLowerCase() || "unknown";
const sourceType = (l) => (l.source_type || "").trim().toLowerCase() || "unknown";
const title = (l) => (l.handbook_title || l.source_title || l.source_id || "").trim();
const section = (l) => (l.section_key || "").trim();
const question = (l) => (l.query || l.question || "").trim();

function chip(text, cls) {
  const t = String(text || "unknown").toLowerCase();
  return `<span class="chip ${cls || t}">${esc(t)}</span>`;
}

function showError(msg) {
  errorBox.style.display = "block";
  errorBox.textContent = msg || "Error";
}

function clearError() {
  errorBox.style.display = "none";
  errorBox.textContent = "";
}

// ============================================================
// Auth
// ============================================================

const adminActive = () =>
  Boolean(localStorage.getItem(LS.adminToken)) &&
  Date.now() < Number(localStorage.getItem(LS.adminUntil) || "0");

const adminToken = () => localStorage.getItem(LS.adminToken) || "";

async function ensureAdmin() {
  if (adminActive()) return true;

  const pin = prompt("Admin PIN required to view logs:");
  if (!pin) return false;

  try {
    const res = await fetch(ADMIN_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin.trim() }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      showError(data.error || "That PIN was not recognised.");
      return false;
    }

    localStorage.setItem(LS.adminToken, data.token);
    localStorage.setItem(LS.adminUntil, String(Date.now() + (data.expires_in || 28800) * 1000));
    return true;
  } catch {
    showError("Could not reach the server.");
    return false;
  }
}

// ============================================================
// Filter dropdowns — rebuilt from data, selection preserved
// ============================================================

function rebuildSelect(select, values, allLabel) {
  const current = select.value;
  const sorted = [...new Set(values)].filter(Boolean).sort();

  select.innerHTML =
    `<option value="">${allLabel}</option>` +
    sorted.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

  if (sorted.includes(current)) select.value = current;
}

function rebuildFilters(logs) {
  rebuildSelect(campusSelect, logs.map((l) => String(l.campus || "").toUpperCase()), "All campuses");
  rebuildSelect(roleSelect, [...logs.map(role), "staff", "parent", "admin"], "All roles");
  rebuildSelect(sourceSelect, [...logs.map(sourceType), "policy", "protocol", "handbook"], "All sources");
}

// ============================================================
// Render
// ============================================================

function render() {
  const q = searchInput.value.trim().toLowerCase();
  const campus = campusSelect.value.toUpperCase();
  const r = roleSelect.value.toLowerCase();
  const src = sourceSelect.value.toLowerCase();
  const badOnly = onlyErrors.checked;

  let rows = ALL;
  if (campus) rows = rows.filter((l) => String(l.campus || "").toUpperCase() === campus);
  if (r) rows = rows.filter((l) => role(l) === r);
  if (src) rows = rows.filter((l) => sourceType(l) === src);
  if (badOnly) rows = rows.filter((l) => l.ok === false);

  if (q) {
    rows = rows.filter((l) =>
      [question(l), title(l), section(l), role(l), sourceType(l), String(l.campus || "")]
        .join(" ").toLowerCase().includes(q)
    );
  }

  countPill.textContent = `${rows.length} of ${ALL.length}`;

  tbody.innerHTML = rows.map((l) => `
    <tr>
      <td class="small muted">${esc(fmtTime(l.ts))}</td>
      <td>${esc(l.campus || "—")}</td>
      <td>${chip(role(l))}</td>
      <td>${l.ok === true ? '<span class="state-ok">OK</span>' : '<span class="state-bad">BAD</span>'}</td>
      <td class="right">${Number(l.ms || 0)}</td>
      <td>${chip(sourceType(l))}</td>
      <td class="small">${esc(title(l))}</td>
      <td class="small muted">${esc(section(l))}</td>
      <td class="q">${esc(question(l))}</td>
    </tr>`).join("") || `<tr><td colspan="9" class="muted">No questions match these filters.</td></tr>`;

  statusText.textContent = `Showing ${rows.length} of ${ALL.length}`;
}

// ============================================================
// Load
// ============================================================

async function load() {
  clearError();
  refreshBtn.disabled = true;
  statusText.textContent = "Loading…";

  try {
    if (!(await ensureAdmin())) {
      statusText.textContent = "Admin sign-in required.";
      return;
    }

    const res = await fetch(LOGS_URL, { headers: { Authorization: `Bearer ${adminToken()}` } });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem(LS.adminToken);
      localStorage.removeItem(LS.adminUntil);
      showError("Admin session expired. Reload to sign in again.");
      statusText.textContent = "Session expired.";
      return;
    }
    if (!res.ok || !data.ok) throw new Error(data.error || "Could not load logs");

    ALL = (Array.isArray(data.logs) ? data.logs : [])
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));

    rebuildFilters(ALL);
    render();
  } catch (e) {
    showError(e?.message || "Network error");
    statusText.textContent = "Could not load logs.";
  } finally {
    refreshBtn.disabled = false;
  }
}

// ============================================================
// Events + init
// ============================================================

refreshBtn.addEventListener("click", load);
searchInput.addEventListener("input", render);
[campusSelect, roleSelect, sourceSelect, onlyErrors].forEach((el) =>
  el.addEventListener("change", render)
);

load();
