// ============================================================
// CMS Assistant v2 — dashboard.js
// External script only. Every id below exists in dashboard.html.
// ============================================================

// Served from localhost -> talk to `wrangler dev`; otherwise the deployed Worker.
const WORKER_BASE =
  ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://cms-assistant-v2.shokbhl.workers.dev";
const STATS_URL = `${WORKER_BASE}/admin/stats?limit=200`;
const LOGS_URL = `${WORKER_BASE}/admin/logs?limit=240`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;

const LS = { adminToken: "cms2_admin_token", adminUntil: "cms2_admin_until" };
const AUTO_REFRESH_MS = 5 * 60 * 1000;

const $ = (id) => document.getElementById(id);

const badgeEl = $("badge");
const statusLine = $("status-line");
const lastRefresh = $("last-refresh");
const autoState = $("auto-refresh-state");
const refreshBtn = $("refresh-btn");
const errorBox = $("error-box");

const kpiTotal = $("kpi-total");
const kpiOk = $("kpi-ok");
const kpiBad = $("kpi-bad");
const kpiMs = $("kpi-ms");
const kpiOkRate = $("kpi-ok-rate");
const kpiBadgeWrap = $("kpi-badge-wrap");
const kpiRange = $("kpi-range");

const byCampusBody = $("by-campus");
const byRoleBody = $("by-role");
const bySourceBody = $("by-source");
const topicsBody = $("topics-body");
const gapsBody = $("gaps-body");
const latestBody = $("latest-body");

const campusCanvas = $("campus-chart");
const trendCanvas = $("trend-chart");

let timer = null;

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

function num(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function fmtTime(ts) {
  const d = new Date(num(ts));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function showError(msg) {
  errorBox.style.display = "block";
  errorBox.textContent = msg || "Error";
}

function clearError() {
  errorBox.style.display = "none";
  errorBox.textContent = "";
}

function setBadge(state) {
  const s = String(state || "OK").toUpperCase();
  badgeEl.textContent = s;
  badgeEl.classList.remove("ok", "warn", "bad");
  badgeEl.classList.add(s === "BAD" ? "bad" : s === "WARN" ? "warn" : "ok");
}

function chip(text, cls) {
  const t = String(text || "unknown").toLowerCase();
  return `<span class="chip ${cls || t}">${esc(t)}</span>`;
}

const role = (l) => (l.user_role || l.role || "").trim().toLowerCase() || "unknown";
const sourceType = (l) => (l.source_type || "").trim().toLowerCase() || "unknown";
const title = (l) => (l.handbook_title || l.source_title || l.source_id || "").trim();
const section = (l) => (l.section_key || "").trim();
const question = (l) => (l.query || l.question || "").trim();

// v2 returns ok:true plus ok_count. v1 collided the two, so fall back
// only when `ok` is genuinely numeric.
function okCountOf(stats) {
  if (Number.isFinite(Number(stats.ok_count))) return Number(stats.ok_count);
  if (typeof stats.ok === "number") return stats.ok;
  return Math.max(0, num(stats.total) - num(stats.bad));
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

  const pin = prompt("Admin PIN required to view the dashboard:");
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

async function authedGet(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${adminToken()}` } });
  return { res, data: await res.json().catch(() => ({})) };
}

// ============================================================
// Analysis
// ============================================================

const TOPIC_RULES = [
  ["Arrival / Pickup", ["arrival", "pickup", "pick-up", "drop off", "drop-off", "dismissal", "late"]],
  ["Illness / Health", ["sick", "fever", "ill", "vomit", "diarrhea", "symptom", "medication", "health"]],
  ["Allergies", ["allergy", "allergies", "anaphylaxis", "epipen", "epi-pen"]],
  ["Sleep / Nap", ["sleep", "nap", "rest"]],
  ["Behaviour", ["behaviour", "behavior", "discipline", "prohibited", "conduct"]],
  ["Emergency / Safety", ["emergency", "fire", "evacuation", "lockdown", "safety"]],
  ["Fees / Payment", ["fee", "payment", "tuition", "nsf", "withdrawal", "invoice"]],
  ["Clothing / Uniform", ["uniform", "dress code", "clothing", "shoes"]],
  ["Field Trips", ["field trip", "off premises", "off-premises", "excursion"]],
  ["Enrolment", ["waiting list", "enrol", "enroll", "registration", "admission"]],
];

function topicOf(q) {
  const s = String(q || "").toLowerCase();
  for (const [name, keys] of TOPIC_RULES) {
    if (keys.some((k) => s.includes(k))) return name;
  }
  return "Other";
}

function rollingBadRate(logsAsc, window = 20) {
  return logsAsc.map((_, i) => {
    const slice = logsAsc.slice(Math.max(0, i - window + 1), i + 1);
    const bad = slice.filter((r) => r.ok === false).length;
    return slice.length ? bad / slice.length : 0;
  });
}

// ============================================================
// Charts (canvas, no library) + shared tooltip
// ============================================================

let tip = null;
function tooltip() {
  if (tip) return tip;
  tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "fixed", zIndex: "9999", pointerEvents: "none",
    padding: "7px 10px", borderRadius: "10px",
    border: "1px solid var(--line)", background: "var(--card)",
    color: "var(--text)", font: "12px system-ui",
    boxShadow: "0 10px 20px rgba(0,0,0,.18)", display: "none",
  });
  document.body.appendChild(tip);
  return tip;
}

function attachTooltip(canvas, resolve) {
  const t = tooltip();
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect();
    // Canvas is CSS-scaled, so map client coords into canvas space.
    const text = resolve(
      ((e.clientX - r.left) / r.width) * canvas.width,
      ((e.clientY - r.top) / r.height) * canvas.height
    );
    if (!text) return (t.style.display = "none");
    t.textContent = text;
    t.style.display = "block";
    t.style.left = `${e.clientX + 12}px`;
    t.style.top = `${e.clientY + 12}px`;
  };
  canvas.onmouseleave = () => { t.style.display = "none"; };
}

function themeColors() {
  const css = getComputedStyle(document.body);
  return {
    axis: css.getPropertyValue("--line").trim() || "#cbd5e1",
    text: css.getPropertyValue("--muted").trim() || "#64748b",
    bar: css.getPropertyValue("--brand-2").trim() || "#1f5fbf",
    line: css.getPropertyValue("--danger").trim() || "#b91c1c",
  };
}

function drawEmpty(ctx, w, h, msg) {
  const c = themeColors();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c.text;
  ctx.font = "13px system-ui";
  ctx.fillText(msg, 16, h / 2);
}

function drawBars(canvas, labels, values) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, pad = 38;
  const c = themeColors();

  if (!values.length) return drawEmpty(ctx, W, H, "No questions yet.");
  ctx.clearRect(0, 0, W, H);

  const max = Math.max(1, ...values);
  ctx.strokeStyle = c.axis;
  ctx.beginPath();
  ctx.moveTo(pad, 8); ctx.lineTo(pad, H - pad); ctx.lineTo(W - 8, H - pad);
  ctx.stroke();

  const gap = 12;
  const bw = Math.max(14, (W - pad - 16 - gap * (values.length - 1)) / values.length);
  const bars = [];

  values.forEach((v, i) => {
    const x = pad + i * (bw + gap);
    const h = (H - pad - 16) * (v / max);
    const y = H - pad - h;

    ctx.fillStyle = c.bar;
    ctx.globalAlpha = .85;
    ctx.fillRect(x, y, bw, h);
    ctx.globalAlpha = 1;

    ctx.fillStyle = c.text;
    ctx.font = "12px system-ui";
    ctx.fillText(String(labels[i]), x, H - pad + 16);

    bars.push({ x, y, w: bw, h, label: labels[i], value: v });
  });

  attachTooltip(canvas, (mx, my) => {
    const hit = bars.find((b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
    return hit ? `${hit.label}: ${hit.value}` : "";
  });
}

function drawLine(canvas, rates) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, pad = 38;
  const c = themeColors();

  if (rates.length < 2) return drawEmpty(ctx, W, H, "Not enough data yet.");
  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = c.axis;
  ctx.beginPath();
  ctx.moveTo(pad, 8); ctx.lineTo(pad, H - pad); ctx.lineTo(W - 8, H - pad);
  ctx.stroke();

  ctx.fillStyle = c.text;
  ctx.font = "11px system-ui";
  ctx.fillText("100%", 4, 14);
  ctx.fillText("0%", 16, H - pad + 4);

  const stepX = (W - pad - 16) / Math.max(1, rates.length - 1);
  const dots = rates.map((r, i) => ({
    x: pad + i * stepX,
    y: H - pad - (H - pad - 16) * r,
    rate: r,
  }));

  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  dots.forEach((d, i) => (i ? ctx.lineTo(d.x, d.y) : ctx.moveTo(d.x, d.y)));
  ctx.stroke();

  attachTooltip(canvas, (mx, my) => {
    let best = null;
    for (const d of dots) {
      const dist = Math.hypot(mx - d.x, my - d.y);
      if (dist < 10 && (!best || dist < best.dist)) best = { ...d, dist };
    }
    return best ? `Unanswered: ${(best.rate * 100).toFixed(1)}%` : "";
  });
}

// ============================================================
// Renderers
// ============================================================

function renderBuckets(tbody, map, asChip) {
  const keys = Object.keys(map || {}).sort();
  tbody.innerHTML = keys.map((k) => {
    const r = map[k] || {};
    return `<tr>
      <td>${asChip ? chip(k) : esc(k)}</td>
      <td class="right">${num(r.total)}</td>
      <td class="right">${num(r.ok)}</td>
      <td class="right">${num(r.bad)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="4" class="muted">No data yet</td></tr>`;
}

function renderLatest(logs) {
  latestBody.innerHTML = logs.slice(0, 30).map((l) => `
    <tr>
      <td class="small muted">${esc(fmtTime(l.ts))}</td>
      <td>${esc(l.campus || "—")}</td>
      <td>${chip(role(l))}</td>
      <td>${l.ok === true ? '<span class="state-ok">OK</span>' : '<span class="state-bad">BAD</span>'}</td>
      <td class="right">${num(l.ms)}</td>
      <td>${chip(sourceType(l))}</td>
      <td class="small muted">${esc(title(l))}</td>
      <td class="small muted">${esc(section(l))}</td>
      <td class="q">${esc(question(l))}</td>
    </tr>`).join("") || `<tr><td colspan="9" class="muted">No questions yet</td></tr>`;
}

function renderTopics(logs) {
  const counts = {};
  for (const l of logs) {
    const t = topicOf(question(l));
    counts[t] = (counts[t] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  topicsBody.innerHTML = entries.map(([t, n]) => `
    <tr>
      <td><b>${esc(t)}</b></td>
      <td class="right">${n}</td>
      <td class="right">${logs.length ? ((n / logs.length) * 100).toFixed(1) : "0.0"}%</td>
    </tr>`).join("") || `<tr><td colspan="3" class="muted">No data yet</td></tr>`;
}

// Unanswered questions are the actionable output: each one is a content gap.
function renderGaps(logs) {
  const gaps = logs.filter((l) => l.ok === false && question(l)).slice(0, 15);

  gapsBody.innerHTML = gaps.map((l) => `
    <tr>
      <td class="small muted">${esc(fmtTime(l.ts))}</td>
      <td>${esc(l.campus || "—")}</td>
      <td class="q">${esc(question(l))}</td>
    </tr>`).join("") || `<tr><td colspan="3" class="muted">Nothing unanswered — good sign.</td></tr>`;
}

function setKpis(stats) {
  const total = num(stats.total);
  const ok = okCountOf(stats);
  const bad = num(stats.bad);

  kpiTotal.textContent = total;
  kpiOk.textContent = ok;
  kpiBad.textContent = bad;
  kpiMs.textContent = num(stats.avg_ms);
  kpiOkRate.textContent = `${total ? Math.round((ok / total) * 100) : 100}% answered`;
  kpiRange.textContent = "Most recent 200 questions";

  const badge = String(stats.badge || "OK").toUpperCase();
  const cls = badge === "OK" ? "ok" : badge === "WARN" ? "warn" : "bad";
  kpiBadgeWrap.innerHTML = `Health: <span class="badge ${cls}">${esc(badge)}</span>`;
  setBadge(badge);
}

// ============================================================
// Refresh
// ============================================================

async function refresh() {
  clearError();
  refreshBtn.disabled = true;

  try {
    if (!(await ensureAdmin())) {
      statusLine.textContent = "Admin sign-in required.";
      return;
    }

    statusLine.textContent = "Refreshing…";

    const [stats, logsRes] = await Promise.all([authedGet(STATS_URL), authedGet(LOGS_URL)]);

    if (stats.res.status === 401 || logsRes.res.status === 401) {
      localStorage.removeItem(LS.adminToken);
      localStorage.removeItem(LS.adminUntil);
      statusLine.textContent = "Session expired — reload to sign in again.";
      showError("Admin session expired.");
      return;
    }
    if (!stats.res.ok || !stats.data.ok) throw new Error(stats.data.error || "Could not load stats");
    if (!logsRes.res.ok || !logsRes.data.ok) throw new Error(logsRes.data.error || "Could not load logs");

    setKpis(stats.data);
    renderBuckets(byCampusBody, stats.data.byCampus);
    renderBuckets(byRoleBody, stats.data.byRole, true);
    renderBuckets(bySourceBody, stats.data.bySourceType, true);

    const logs = Array.isArray(logsRes.data.logs) ? logsRes.data.logs : [];
    const desc = logs.slice().sort((a, b) => num(b.ts) - num(a.ts));
    const asc = logs.slice().sort((a, b) => num(a.ts) - num(b.ts));

    renderLatest(desc);
    renderTopics(logs);
    renderGaps(desc);

    const counts = {};
    for (const l of logs) counts[l.campus || "—"] = (counts[l.campus || "—"] || 0) + 1;
    const labels = Object.keys(counts).sort();
    drawBars(campusCanvas, labels, labels.map((k) => counts[k]));
    drawLine(trendCanvas, rollingBadRate(asc, 20));

    lastRefresh.textContent = new Date().toLocaleTimeString();
    statusLine.textContent = `Showing ${logs.length} recent questions.`;
  } catch (e) {
    showError(e?.message || "Network error");
    statusLine.textContent = "Could not refresh.";
  } finally {
    refreshBtn.disabled = false;
  }
}

function setAutoLabel() {
  autoState.textContent = document.visibilityState === "visible" ? "ON" : "PAUSED";
}

// ============================================================
// Init
// ============================================================

refreshBtn.addEventListener("click", refresh);
document.addEventListener("visibilitychange", setAutoLabel);

(async function init() {
  setAutoLabel();
  await refresh();
  timer = setInterval(() => {
    if (document.visibilityState === "visible") refresh();
    setAutoLabel();
  }, AUTO_REFRESH_MS);
})();
