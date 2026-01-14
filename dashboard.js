const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const STATS_URL = `${WORKER_BASE}/admin/stats`;

const LS_ADMIN_TOKEN = "cms_admin_token";
const LS_ADMIN_UNTIL = "cms_admin_until";

const badgeEl = document.getElementById("badge");
const lastEl = document.getElementById("last");
const errorEl = document.getElementById("error");

const cTotal = document.getElementById("c-total");
const cOk = document.getElementById("c-ok");
const cBad = document.getElementById("c-bad");
const cAvg = document.getElementById("c-avg");

const tbody = document.getElementById("tbody");
const refreshBtn = document.getElementById("refresh");
const autoBtn = document.getElementById("auto");

let autoOn = true;
let timer = null;

function tokenOk() {
  const token = localStorage.getItem(LS_ADMIN_TOKEN);
  const until = Number(localStorage.getItem(LS_ADMIN_UNTIL) || "0");
  return token && Date.now() < until;
}

function getToken() {
  return localStorage.getItem(LS_ADMIN_TOKEN) || "";
}

function badgeTooltipText(b) {
  if (b === "OK") return "OK = healthy (success rate high)";
  if (b === "WARN") return "WARN = some failures detected";
  if (b === "BAD") return "BAD = high failure rate";
  return "";
}

async function loadStats() {
  errorEl.textContent = "";

  if (!tokenOk()) {
    errorEl.textContent = "Admin token missing/expired. Go back and enable Admin Mode again.";
    return;
  }

  const res = await fetch(STATS_URL + "?limit=200", {
    headers: { Authorization: `Bearer ${getToken()}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    errorEl.textContent = data.error || "Failed to load stats.";
    return;
  }

  const badge = data.badge || "—";
  badgeEl.textContent = `STATUS: ${badge}`;
  badgeEl.title = badgeTooltipText(badge); // tooltip

  cTotal.textContent = `Total: ${data.total ?? "—"}`;
  cOk.textContent = `OK: ${data.ok ?? "—"}`;
  cBad.textContent = `BAD: ${data.bad ?? "—"}`;
  cAvg.textContent = `Avg ms: ${data.avg_ms ?? "—"}`;

  tbody.innerHTML = "";
  const byCampus = data.byCampus || {};
  for (const [campus, v] of Object.entries(byCampus)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:10px; border-bottom:1px solid #eef2ff;">${campus}</td>
      <td style="padding:10px; border-bottom:1px solid #eef2ff;">${v.total ?? 0}</td>
      <td style="padding:10px; border-bottom:1px solid #eef2ff;">${v.ok ?? 0}</td>
      <td style="padding:10px; border-bottom:1px solid #eef2ff;">${v.bad ?? 0}</td>
    `;
    tbody.appendChild(tr);
  }

  lastEl.textContent = `Last refresh: ${new Date().toLocaleString()}`;
}

function startAuto() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    // auto-refresh فقط وقتی tab فعاله
    if (document.visibilityState === "visible" && autoOn) loadStats();
  }, 5 * 60 * 1000); // 5 minutes
}

refreshBtn.addEventListener("click", loadStats);

autoBtn.addEventListener("click", () => {
  autoOn = !autoOn;
  autoBtn.textContent = `Auto refresh: ${autoOn ? "ON" : "OFF"} (5 min)`;
});

startAuto();
loadStats();
