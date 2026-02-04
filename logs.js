// logs.js (PROFESSIONAL FULL VERSION - Matches logs.html IDs)
// - Fetches and renders admin logs with sorting
// - Supports filters: search, campus, role, only errors
// - Dynamic options for campus and role selects
// - Error handling and status updates
// - Escapes HTML for security

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const LOGS_URL = `${WORKER_BASE}/admin/logs?limit=200`;

const LS = {
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

// ================= HELPERS =================
/**
 * Retrieves admin token.
 * @returns {string}
 */
function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
}

/**
 * Checks if admin is active.
 * @returns {boolean}
 */
function isAdminActive() {
  const token = localStorage.getItem(LS.adminToken);
  const until = Number(localStorage.getItem(LS.adminUntil) || "0");
  return !!token && Date.now() < until;
}

/**
 * Escapes HTML to prevent XSS.
 * @param {any} s 
 * @returns {string}
 */
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Formats timestamp to locale string.
 * @param {number} ts 
 * @returns {string}
 */
function fmtTime(ts) {
  const d = new Date(Number(ts || 0));
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString();
}

/**
 * Normalizes role from log.
 * @param {Object} l 
 * @returns {string}
 */
function normalizeRole(l) {
  return (l.user_role || l.role || "").trim().toLowerCase() || "unknown";
}

/**
 * Normalizes source type.
 * @param {Object} l 
 * @returns {string}
 */
function normalizeSourceType(l) {
  return l.source_type || "unknown";
}

/**
 * Normalizes title.
 * @param {Object} l 
 * @returns {string}
 */
function normalizeTitle(l) {
  return l.handbook_title || l.source_id || "";
}

/**
 * Normalizes section.
 * @param {Object} l 
 * @returns {string}
 */
function normalizeSection(l) {
  return l.section_key || "";
}

/**
 * Normalizes question/query.
 * @param {Object} l 
 * @returns {string}
 */
function normalizeQuestion(l) {
  return l.query || "";
}

/**
 * Rebuilds campus select options from logs.
 * @param {Array} logs 
 */
function rebuildCampusOptions(logs) {
  const campuses = new Set(logs.map(l => l.campus || "UNKNOWN"));
  campusSelect.innerHTML = '<option value="">All Campuses</option>';
  [...campuses].sort().forEach(c => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = c;
    campusSelect.appendChild(opt);
  });
}

/**
 * Rebuilds role select options from logs.
 * @param {Array} logs 
 */
function rebuildRoleOptions(logs) {
  const roles = new Set(logs.map(l => normalizeRole(l)));
  roleSelect.innerHTML = '<option value="">All Roles</option>';
  [...roles].sort().forEach(r => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = r;
    roleSelect.appendChild(opt);
  });
}

/**
 * Sets status text.
 * @param {string} msg 
 */
function setStatus(msg) {
  statusText.textContent = msg;
}

/**
 * Shows error box.
 * @param {string} msg 
 */
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

/**
 * Clears error box.
 */
function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

// ================= DOM =================
const tbody = document.getElementById("tbody");
const statusText = document.getElementById("statusText");
const countPill = document.getElementById("countPill");
const errorBox = document.getElementById("errorBox");

const searchInput = document.getElementById("searchInput");
const campusSelect = document.getElementById("campusSelect");
const roleSelect = document.getElementById("roleSelect");
const onlyErrors = document.getElementById("onlyErrors");
const refreshBtn = document.getElementById("refreshBtn");

// ================= STATE =================
let ALL_LOGS = [];

// ================= RENDER =================
/**
 * Renders filtered logs to table.
 */
function render() {
  const search = searchInput.value.trim().toLowerCase();
  const campus = campusSelect.value;
  const role = roleSelect.value;
  const errorsOnly = onlyErrors.checked;

  const filtered = ALL_LOGS.filter(l => {
    if (campus && l.campus !== campus) return false;
    if (role && normalizeRole(l) !== role) return false;
    if (errorsOnly && l.ok) return false;
    if (search) {
      const q = normalizeQuestion(l).toLowerCase();
      const t = normalizeTitle(l).toLowerCase();
      return q.includes(search) || t.includes(search);
    }
    return true;
  });

  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td>${fmtTime(l.ts)}</td>
      <td>${esc(l.campus || "UNKNOWN")}</td>
      <td>${esc(normalizeRole(l))}</td>
      <td>${l.ok ? "✅" : "❌"}</td>
      <td>${Number(l.ms || 0)}</td>
      <td>${esc(normalizeSourceType(l))}</td>
      <td class="small">${esc(normalizeTitle(l))}</td>
      <td class="small muted">${esc(normalizeSection(l))}</td>
      <td class="q">${esc(normalizeQuestion(l))}</td>
    </tr>
  `).join("");

  setStatus(`Showing ${filtered.length} / ${ALL_LOGS.length} logs`);
  countPill.textContent = `${filtered.length} Logs`;
}

// ================= LOAD =================
/**
 * Loads logs from API.
 */
async function loadLogs() {
  clearError();
  refreshBtn.disabled = true;
  setStatus("Loading…");

  if (!isAdminActive()) {
    showError("Admin session expired. Enable Admin mode again in main app.");
    setStatus("Admin required.");
    refreshBtn.disabled = false;
    return;
  }

  try {
    const data = await adminFetch("/admin/logs?limit=200");
    if (!data) throw new Error("Failed to load logs");

    ALL_LOGS = data.logs || [];
    ALL_LOGS.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)); // Descending

    rebuildCampusOptions(ALL_LOGS);
    rebuildRoleOptions(ALL_LOGS);
    render();

  } catch (err) {
    showError(err.message || "Network error");
    setStatus("Error loading logs");
  } finally {
    refreshBtn.disabled = false;
  }
}

// ================= EVENTS =================
refreshBtn.addEventListener("click", loadLogs);
searchInput.addEventListener("input", render);
campusSelect.addEventListener("change", render);
roleSelect.addEventListener("change", render);
onlyErrors.addEventListener("change", render);

// ================= INIT =================
(function init() {
  requireAdminOrRedirect(); // From admin.js
  loadLogs();
})();