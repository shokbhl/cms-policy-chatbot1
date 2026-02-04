// logs.js
const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const LOGS_URL = `${WORKER_BASE}/admin/logs`;

const LS = {
  adminToken: "cms_admin_token"
};

function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchLogs(limit = 200) {
  const token = getAdminToken();
  const res = await fetch(`${LOGS_URL}?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load logs");
  return data.logs || [];
}

// ---- UI refs (adjust ids to your file) ----
const roleSelect = document.getElementById("role-filter");     // <select>
const campusSelect = document.getElementById("campus-filter"); // <select>
const searchInput = document.getElementById("search-input");   // <input>
const tableBody = document.getElementById("logs-tbody");       // <tbody>
const refreshBtn = document.getElementById("refresh-btn");     // <button>

let ALL_LOGS = [];

function normalizeRole(r) {
  const x = String(r || "").trim().toLowerCase();
  return x || "unknown";
}

function rebuildRoleOptions(logs) {
  if (!roleSelect) return;

  const rolesSet = new Set();
  logs.forEach((l) => rolesSet.add(normalizeRole(l.user_role)));

  // ✅ ensure these exist even if not in current slice
  ["staff", "parent", "admin", "unknown"].forEach((x) => rolesSet.add(x));

  const roles = Array.from(rolesSet).sort();

  roleSelect.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All roles";
  roleSelect.appendChild(optAll);

  roles.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    roleSelect.appendChild(opt);
  });
}

function rebuildCampusOptions(logs) {
  if (!campusSelect) return;

  const set = new Set();
  logs.forEach((l) => set.add(String(l.campus || "UNKNOWN")));

  const campuses = Array.from(set).sort();
  campusSelect.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All campuses";
  campusSelect.appendChild(optAll);

  campuses.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    campusSelect.appendChild(opt);
  });
}

function renderTable(rows) {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    const ts = new Date(Number(r.ts || 0));
    const timeStr = isFinite(ts.getTime()) ? ts.toLocaleString() : "-";

    const role = normalizeRole(r.user_role); // ✅ never blank
    const campus = r.campus || "UNKNOWN";
    const ok = r.ok ? "OK" : "BAD";
    const ms = Number(r.ms || 0);

    const handbookTitle = r.handbook_title ? `Handbook: ${r.handbook_title}` : "";
    const q = r.query || "";

    tr.innerHTML = `
      <td>${escapeHtml(timeStr)}</td>
      <td>${escapeHtml(campus)}</td>
      <td>${escapeHtml(role)}</td>
      <td>${escapeHtml(ok)}</td>
      <td>${escapeHtml(String(ms))}</td>
      <td>${escapeHtml(handbookTitle)}</td>
      <td>${escapeHtml(q)}</td>
    `;

    tableBody.appendChild(tr);
  });
}

function applyFilters() {
  const roleVal = roleSelect ? roleSelect.value : "";
  const campusVal = campusSelect ? campusSelect.value : "";
  const q = (searchInput?.value || "").trim().toLowerCase();

  const filtered = ALL_LOGS.filter((r) => {
    const role = normalizeRole(r.user_role);
    const campus = String(r.campus || "UNKNOWN");
    const query = String(r.query || "").toLowerCase();
    const hb = String(r.handbook_title || "").toLowerCase();

    if (roleVal && role !== roleVal) return false;
    if (campusVal && campus !== campusVal) return false;
    if (q && !(query.includes(q) || hb.includes(q))) return false;
    return true;
  });

  renderTable(filtered);
}

async function load() {
  try {
    ALL_LOGS = await fetchLogs(200);
    rebuildRoleOptions(ALL_LOGS);
    rebuildCampusOptions(ALL_LOGS);
    applyFilters();
  } catch (e) {
    alert(e.message || "Failed to load logs");
  }
}

roleSelect?.addEventListener("change", applyFilters);
campusSelect?.addEventListener("change", applyFilters);
searchInput?.addEventListener("input", applyFilters);
refreshBtn?.addEventListener("click", load);

load();
