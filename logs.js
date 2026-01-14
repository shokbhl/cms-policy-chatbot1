const API_BASE = "https://cms-policy-worker.YOURNAME.workers.dev";

const loadBtn = document.getElementById("load-logs");
const tbody = document.getElementById("logs-body");
const statusEl = document.getElementById("logs-status");
const countEl = document.getElementById("logs-count");
const errEl = document.getElementById("logs-error");

function fmt(ts) {
  return new Date(ts).toLocaleString();
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function loadLogs() {
  errEl.textContent = "";
  tbody.innerHTML = "";
  statusEl.textContent = "Status: loading...";
  countEl.textContent = "Count: —";

  const token = localStorage.getItem("cms_admin_token") || "";
  const until = Number(localStorage.getItem("cms_admin_until") || 0);

  if (!token || Date.now() > until) {
    statusEl.textContent = "Status: unauthorized";
    errEl.textContent = "Admin token missing/expired. Go back and enable Admin Mode again.";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/logs?limit=120`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      statusEl.textContent = "Status: blocked";
      errEl.textContent = "Blocked by Cloudflare Access (SSO). Disable Access on Worker or allow this route.";
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = "Status: error";
      errEl.textContent = data?.error || "Failed to load logs.";
      return;
    }

    statusEl.textContent = "Status: ok";
    countEl.textContent = `Count: ${data.count || 0}`;

    const logs = data.logs || [];
    for (const r of logs) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmt(r.ts)}</td>
        <td>${escapeHtml(r.campus)}</td>
        <td>${escapeHtml(r.role)}</td>
        <td>${r.ok ? "✅" : "❌"}</td>
        <td>${escapeHtml(r.ms)}</td>
        <td title="${escapeHtml(r.query)}">${escapeHtml(r.query)}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    statusEl.textContent = "Status: error";
    errEl.textContent = "Error connecting to server.";
  }
}

loadBtn.addEventListener("click", loadLogs);
