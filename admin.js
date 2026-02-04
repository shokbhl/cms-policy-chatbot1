// admin.js (shared for dashboard.html and logs.html)
const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";

const LS = {
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

function isAdminActive() {
  const token = localStorage.getItem(LS.adminToken);
  const until = Number(localStorage.getItem(LS.adminUntil) || "0");
  return !!token && Date.now() < until;
}

function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
}

function requireAdminOrRedirect() {
  if (!isAdminActive()) {
    alert("Admin session expired. Please enable Admin Mode again in the main app.");
    window.location.href = "index.html";
    return false;
  }
  return true;
}

async function adminFetch(path) {
  const res = await fetch(`${WORKER_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` }
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    alert(data.error || "Unauthorized. Re-enable Admin Mode.");
    window.location.href = "index.html";
    return null;
  }

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
