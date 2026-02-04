// logs.js (MATCHED WITH logs.html IDs)
const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const LOGS_URL = `${WORKER_BASE}/admin/logs?limit=200`;

const LS = {
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

// ================= HELPERS =================
function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
}

function isAdminActive() {
  const token = localStorage.getItem(LS.adminToken);
  const until = Number(localStorage.getItem(LS.adminUntil) || "0");
  return !!token && Date.now() < until;
}

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
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString();
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

// ================= NORMALIZERS =================
function normalizeRole(l) {
  const r = (l.user_role || l.role || "").trim().toLowerCase();
  return r || "unknown";
}

function normalizeSourceType(l) {
  return (l.source_type || "").trim().toLowerCase() || "unknown";
}

function normalizeTitle(l) {
  return (l.handbook_title || l.source_title || l.source_id || "").trim();
}

function normalizeSection(l) {
  return (l.section_key || "").trim();
}

function normalizeQuestion(l) {
  return (l.query || l.question || "").trim();
}

// ================= UI HELPERS =================
function showError(msg) {
  errorBox.style.display = "block";
  errorBox.textContent = msg || "Error";
}

function clearError() {
  errorBox.style.display = "none";
  errorBox.textContent = "";
}

function setStatus(msg) {
  statusText.textContent = msg;
}

// ================= SELECT BUILDERS =================
function rebuildRoleOptions(logs) {
  const fixed = ["staff", "parent", "admin", "unknown"];
  const set = new Set(
    logs.map(l => normalizeRole(l))
  );
  fixed.forEach(r => set.add(r));

  const current = roleSelect.value;
  roleSelect.innerHTML = `<option value="">All roles</option>`;

  Array.from(set).sort().forEach(r => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    roleSelect.appendChild(opt);
  });

  if (current && Array.from(set).includes(current)) {
    roleSelect.value = current;
  }
}

function rebuildCampusOptions(logs) {
  const set = new Set(
    logs.map(l => String(l.campus || "UNKNOWN").toUpperCase())
  );

  const current = campusSelect.value;
  campusSelect.innerHTML = `<option value="">All campuses</option>`;

  Array.from(set).sort().forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    campusSelect.appendChild(opt);
  });

  if (current && Array.from(set).includes(current)) {
    campusSelect.value = current;
  }
}

// ================= RENDER =================
function render() {
  const q = (searchInput.value || "").toLowerCase().trim();
  const campus = (campusSelect.value || "").toUpperCase();
  const role = (roleSelect.value || "").toLowerCase();
  const onlyBad = !!onlyErrors.checked;

  let rows = [...ALL_LOGS];

  if (campus) rows = rows.filter(l => String(l.campus || "").toUpperCase() === campus);
  if (role) rows = rows.filter(l => normalizeRole(l) === role);
  if (onlyBad) rows = rows.filter(l => l.ok === false);

  if (q) {
    rows = rows.filter(l => {
      const hay = [
        normalizeQuestion(l),
        normalizeTitle(l),
        normalizeSection(l),
        normalizeRole(l),
        normalizeSourceType(l),
        String(l.campus || "")
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  countPill.textContent = `${rows.length} logs`;

  tbody.innerHTML = rows.map(l => {
    const okCell = l.ok
      ? `<span class="ok">OK</span>`
      : `<span class="bad">BAD</span>`;

    return `
      <tr>
        <td class="small muted">${esc(fmtTime(l.ts))}</td>
        <td>${esc(l.campus || "UNKNOWN")}</td>
        <td><span class="role-chip">${esc(normalizeRole(l))}</span></td>
        <td>${okCell}</td>
        <td class="right">${esc(String(l.ms || 0))}</td>
        <td>${esc(normalizeSourceType(l))}</td>
        <td class="small">${esc(normalizeTitle(l))}</td>
        <td class="small muted">${esc(normalizeSection(l))}</td>
        <td class="q">${esc(normalizeQuestion(l))}</td>
      </tr>
    `;
  }).join("");

  setStatus(`Showing ${rows.length} / ${ALL_LOGS.length} logs`);
}

// ================= LOAD =================
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
    const res = await fetch(LOGS_URL, {
      headers: { Authorization: `Bearer ${getAdminToken()}` }
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data?.error || "Failed to load logs");
    }

    ALL_LOGS = Array.isArray(data.logs) ? data.logs : [];
    ALL_LOGS.sort((a,b) => Number(b.ts||0) - Number(a.ts||0));

    rebuildCampusOptions(ALL_LOGS);
    rebuildRoleOptions(ALL_LOGS);
    render();

  } catch (e) {
    showError(e.message || "Network error");
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
loadLogs();
