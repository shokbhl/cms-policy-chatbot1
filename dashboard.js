// ============================
// dashboard.js (FINAL)
// - Auto-refresh every 5 minutes ONLY when tab is active
// - Badge OK/WARN/BAD
// - Last refresh time
// - Tooltip charts (no library)
// - Predictive alert based on error-rate trend
// ============================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const STATS_URL = `${WORKER_BASE}/admin/stats?limit=200`;
const LOGS_URL  = `${WORKER_BASE}/admin/logs?limit=240`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;

const LS = {
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until",
  staffToken: "cms_staff_token"
};

const el = (id) => document.getElementById(id);

const badgeEl = el("badge");
const lastRefreshEl = el("last-refresh");
const statusLineEl = el("status-line");
const autoRefreshStateEl = el("auto-refresh-state");
const refreshBtn = el("refresh-btn");

const kpiTotal = el("kpi-total");
const kpiOk = el("kpi-ok");
const kpiBad = el("kpi-bad");
const kpiAvgMs = el("kpi-avgms");

const campusBody = el("campus-body");
const topicsBody = el("topics-body");
const handbooksBody = el("handbooks-body");

const predictiveBox = el("predictive-box");
const predictiveText = el("predictive-text");

const campusCanvas = el("campusChart");
const trendCanvas = el("trendChart");

let refreshTimer = null;

// -------------------------
// Auth helpers
// -------------------------
function isAdminActive() {
  const token = localStorage.getItem(LS.adminToken) || "";
  const until = Number(localStorage.getItem(LS.adminUntil) || "0");
  return !!token && Date.now() < until;
}

function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
}

async function ensureAdminTokenOrPrompt() {
  if (isAdminActive()) return true;

  const pin = prompt("Admin PIN required to view dashboard. Enter Admin PIN:");
  if (!pin) return false;

  const res = await fetch(ADMIN_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: String(pin).trim() })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.error || "Admin PIN invalid.");
    return false;
  }

  const expiresIn = data.expires_in || 28800; // 8h
  localStorage.setItem(LS.adminToken, data.token);
  localStorage.setItem(LS.adminUntil, String(Date.now() + expiresIn * 1000));
  return true;
}

async function authedGet(url) {
  const token = getAdminToken();
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// -------------------------
// UI helpers
// -------------------------
function setBadge(state) {
  const s = String(state || "OK").toUpperCase();
  badgeEl.textContent = s;

  badgeEl.classList.remove("ok", "warn", "bad");
  if (s === "BAD") badgeEl.classList.add("bad");
  else if (s === "WARN") badgeEl.classList.add("warn");
  else badgeEl.classList.add("ok");
}

function setLastRefreshNow() {
  const d = new Date();
  lastRefreshEl.textContent = d.toLocaleString();
}

function setStatus(text) {
  statusLineEl.textContent = text;
}

// -------------------------
// Data processing
// -------------------------
function safeNum(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function okRate(ok, total) {
  if (!total) return 1;
  return ok / total;
}

// Very simple topic bucketing based on keywords in query text
function bucketTopic(query) {
  const q = String(query || "").toLowerCase();

  const rules = [
    ["Safe Arrival / Pickup", ["arrival", "pickup", "pick-up", "drop off", "drop-off", "dismissal", "late pickup", "late pick-up"]],
    ["Health / Illness", ["sick", "fever", "ill", "vomit", "diarrhea", "symptom", "medication"]],
    ["Allergy / Anaphylaxis", ["allergy", "anaphylaxis", "epi", "epipen"]],
    ["Sleep / Nap", ["sleep", "nap"]],
    ["Behaviour", ["behaviour", "behavior", "discipline"]],
    ["Emergency / Fire", ["emergency", "fire", "evacuation", "lockdown"]],
    ["Fees / Payments", ["fee", "payment", "tuition", "nsf", "withdrawal"]],
    ["Uniform / Clothing", ["uniform", "dress code"]],
    ["Field Trips", ["field trip", "off premises", "off-premises"]],
    ["Transparent Classroom", ["transparent classroom", "tc website", "progress report"]],
  ];

  for (const [name, keys] of rules) {
    if (keys.some((k) => q.includes(k))) return name;
  }
  return "Other";
}

function buildHandbookKey(log) {
  const campus = log.campus || "UNKNOWN";
  const hb = log.handbook_id || log.doc_id || "—";
  const section = log.section_key || "—";
  return { campus, hb, section };
}

// Predictive: compare recent error rate vs earlier
function computePredictive(logsSortedAsc) {
  // take last 60 logs (recent) and previous 60
  const n = logsSortedAsc.length;
  const recent = logsSortedAsc.slice(Math.max(0, n - 60));
  const prev = logsSortedAsc.slice(Math.max(0, n - 120), Math.max(0, n - 60));

  const recentTotal = recent.length;
  const prevTotal = prev.length;

  const recentBad = recent.filter((r) => r.ok === false).length;
  const prevBad = prev.filter((r) => r.ok === false).length;

  const recentRate = recentTotal ? recentBad / recentTotal : 0;
  const prevRate = prevTotal ? prevBad / prevTotal : 0;

  const delta = recentRate - prevRate; // positive means worse
  return { recentRate, prevRate, delta, recentTotal, prevTotal };
}

// Rolling error rate series
function buildRollingSeries(logsAsc, window = 20) {
  const points = [];
  for (let i = 0; i < logsAsc.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = logsAsc.slice(start, i + 1);
    const total = slice.length;
    const bad = slice.filter((r) => r.ok === false).length;
    const rate = total ? bad / total : 0;
    points.push({ x: i, y: rate });
  }
  return points;
}

// -------------------------
// Charts (simple canvas) + tooltip
// -------------------------
function drawBarChart(canvas, labels, values, options = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const pad = 40;
  const maxV = Math.max(1, ...values);

  // axes
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 10);
  ctx.lineTo(pad, H - pad);
  ctx.lineTo(W - 10, H - pad);
  ctx.stroke();

  const barCount = values.length;
  const gap = 10;
  const barW = Math.max(12, (W - pad - 20 - gap * (barCount - 1)) / barCount);

  const bars = [];

  for (let i = 0; i < barCount; i++) {
    const v = values[i];
    const x = pad + i * (barW + gap);
    const h = (H - pad - 20) * (v / maxV);
    const y = (H - pad) - h;

    // bar
    ctx.fillStyle = "#003b8e";
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, barW, h);

    // label
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#334155";
    ctx.font = "12px system-ui";
    ctx.fillText(String(labels[i]), x, H - 18);

    bars.push({ x, y, w: barW, h, label: labels[i], value: v });
  }

  attachTooltip(canvas, (mx, my) => {
    for (const b of bars) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        return `${b.label}: ${b.value}`;
      }
    }
    return "";
  });
}

function drawLineChart(canvas, points, options = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const pad = 40;
  const maxY = 1; // rate 0..1

  // axes
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 10);
  ctx.lineTo(pad, H - pad);
  ctx.lineTo(W - 10, H - pad);
  ctx.stroke();

  if (points.length < 2) return;

  // draw line
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2;
  ctx.beginPath();

  const stepX = (W - pad - 20) / Math.max(1, points.length - 1);

  const toXY = (i, y) => {
    const x = pad + i * stepX;
    const yy = (H - pad) - (H - pad - 20) * (y / maxY);
    return { x, y: yy };
  };

  const dots = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const xy = toXY(i, p.y);
    if (i === 0) ctx.moveTo(xy.x, xy.y);
    else ctx.lineTo(xy.x, xy.y);

    dots.push({ x: xy.x, y: xy.y, rate: p.y });
  }
  ctx.stroke();

  // dots
  ctx.fillStyle = "#ef4444";
  for (const d of dots) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  attachTooltip(canvas, (mx, my) => {
    // nearest dot
    let best = null;
    for (const d of dots) {
      const dx = mx - d.x;
      const dy = my - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 8 && (!best || dist < best.dist)) best = { ...d, dist };
    }
    if (!best) return "";
    return `Error rate: ${(best.rate * 100).toFixed(1)}%`;
  });
}

// Tooltip: creates a floating div on body
let tooltipDiv = null;
function ensureTooltipDiv() {
  if (tooltipDiv) return tooltipDiv;
  tooltipDiv = document.createElement("div");
  tooltipDiv.style.position = "fixed";
  tooltipDiv.style.zIndex = "9999";
  tooltipDiv.style.pointerEvents = "none";
  tooltipDiv.style.padding = "8px 10px";
  tooltipDiv.style.borderRadius = "10px";
  tooltipDiv.style.border = "1px solid #cbd5e1";
  tooltipDiv.style.background = "rgba(255,255,255,0.98)";
  tooltipDiv.style.boxShadow = "0 10px 20px rgba(15,23,42,0.15)";
  tooltipDiv.style.font = "12px system-ui";
  tooltipDiv.style.color = "#0f172a";
  tooltipDiv.style.display = "none";
  document.body.appendChild(tooltipDiv);
  return tooltipDiv;
}

function attachTooltip(canvas, resolver) {
  const tip = ensureTooltipDiv();

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const my = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const text = resolver(mx, my);
    if (!text) {
      tip.style.display = "none";
      return;
    }
    tip.textContent = text;
    tip.style.display = "block";
    tip.style.left = `${e.clientX + 12}px`;
    tip.style.top = `${e.clientY + 12}px`;
  };

  canvas.onmouseleave = () => {
    tip.style.display = "none";
  };
}

// -------------------------
// Render tables
// -------------------------
function renderCampusTable(byCampus) {
  campusBody.innerHTML = "";
  const entries = Object.entries(byCampus || {}).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));

  for (const [campus, obj] of entries) {
    const total = safeNum(obj.total);
    const ok = safeNum(obj.ok);
    const bad = safeNum(obj.bad);
    const rate = okRate(ok, total);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${campus}</b></td>
      <td>${total}</td>
      <td>${ok}</td>
      <td>${bad}</td>
      <td>${(rate * 100).toFixed(1)}%</td>
    `;
    campusBody.appendChild(tr);
  }
}

function renderTopics(topicsMap, total) {
  topicsBody.innerHTML = "";
  const entries = Object.entries(topicsMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

  for (const [topic, count] of entries) {
    const share = total ? (count / total) : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${topic}</b></td>
      <td>${count}</td>
      <td>${(share * 100).toFixed(1)}%</td>
    `;
    topicsBody.appendChild(tr);
  }

  if (!entries.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" class="small">No data.</td>`;
    topicsBody.appendChild(tr);
  }
}

function renderHandbooks(rows) {
  handbooksBody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="small">No handbook-specific logs detected yet.</td>`;
    handbooksBody.appendChild(tr);
    return;
  }

  // sort by count desc
  rows.sort((a, b) => b.count - a.count);

  for (const r of rows.slice(0, 20)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(r.campus)}</b></td>
      <td>${escapeHtml(r.handbook || "—")}</td>
      <td>${escapeHtml(r.section || "—")}</td>
      <td>${r.count}</td>
    `;
    handbooksBody.appendChild(tr);
  }
}

// -------------------------
// Predictive badge / notice
// -------------------------
function renderPredictive(p) {
  // thresholds (you can tweak)
  const recentPct = p.recentRate * 100;
  const prevPct = p.prevRate * 100;
  const deltaPct = p.delta * 100;

  let state = "OK";
  let text = `Stable. Recent error rate ${recentPct.toFixed(1)}% (previous ${prevPct.toFixed(1)}%).`;

  // if recent is high OR increasing fast -> warn/bad
  if (p.recentRate >= 0.15 || p.delta >= 0.08) {
    state = "WARN";
    text = `Heads-up: error rate is rising. Recent ${recentPct.toFixed(1)}% vs previous ${prevPct.toFixed(1)}% (Δ ${deltaPct.toFixed(1)}%).`;
  }
  if (p.recentRate >= 0.25 || p.delta >= 0.15) {
    state = "BAD";
    text = `Critical trend: errors increasing quickly. Recent ${recentPct.toFixed(1)}% vs previous ${prevPct.toFixed(1)}% (Δ ${deltaPct.toFixed(1)}%).`;
  }

  predictiveText.textContent = text;

  predictiveBox.classList.remove("ok", "warn", "bad");
  predictiveBox.classList.add(state.toLowerCase());
}

// -------------------------
// Main refresh
// -------------------------
async function refreshAll() {
  const ok = await ensureAdminTokenOrPrompt();
  if (!ok) {
    setStatus("Admin access required.");
    return;
  }

  setStatus("Refreshing…");

  // 1) Stats
  const { res: sRes, data: sData } = await authedGet(STATS_URL);
  if (sRes.status === 401) {
    setStatus("Admin token expired. Refresh and enter PIN again.");
    return;
  }
  if (!sRes.ok) {
    setStatus(`Stats error: ${sData.error || sRes.status}`);
    return;
  }

  setBadge(sData.badge || "OK");
  kpiTotal.textContent = safeNum(sData.total, 0);
  kpiOk.textContent = safeNum(sData.ok, 0);
  kpiBad.textContent = safeNum(sData.bad, 0);
  kpiAvgMs.textContent = safeNum(sData.avg_ms, 0);

  renderCampusTable(sData.byCampus || {});
  setLastRefreshNow();

  // 2) Logs for charts / topics / predictive
  const { res: lRes, data: lData } = await authedGet(LOGS_URL);
  if (!lRes.ok) {
    setStatus(`Logs error: ${lData.error || lRes.status}`);
    return;
  }

  const logs = Array.isArray(lData.logs) ? lData.logs : [];

  // sort logs ascending by ts
  const logsAsc = logs
    .slice()
    .sort((a, b) => safeNum(a.ts) - safeNum(b.ts));

  // Campus chart
  const campusCount = {};
  for (const r of logs) {
    const c = r.campus || "UNKNOWN";
    campusCount[c] = (campusCount[c] || 0) + 1;
  }
  const campusLabels = Object.keys(campusCount);
  const campusValues = campusLabels.map((k) => campusCount[k]);
  drawBarChart(campusCanvas, campusLabels, campusValues);

  // Rolling trend chart (error rate)
  const series = buildRollingSeries(logsAsc, 20);
  drawLineChart(trendCanvas, series);

  // Topics
  const topics = {};
  for (const r of logs) {
    const t = bucketTopic(r.query);
    topics[t] = (topics[t] || 0) + 1;
  }
  renderTopics(topics, logs.length);

  // Handbook breakdown (if fields exist)
  const hbMap = new Map();
  for (const r of logs) {
    const hasHb = r.handbook_id || r.section_key || (r.doc_type === "handbook");
    if (!hasHb) continue;

    const { campus, hb, section } = buildHandbookKey(r);
    const key = `${campus}||${hb}||${section}`;
    hbMap.set(key, (hbMap.get(key) || 0) + 1);
  }

  const hbRows = [];
  for (const [k, count] of hbMap.entries()) {
    const [campus, handbook, section] = k.split("||");
    hbRows.push({ campus, handbook, section, count });
  }
  renderHandbooks(hbRows);

  // Predictive alert
  const pred = computePredictive(logsAsc);
  renderPredictive(pred);

  setStatus(`Loaded ${logs.length} logs + stats. Auto-refresh every 5 minutes when tab is active.`);
}

// -------------------------
// Auto-refresh only when tab active
// -------------------------
function startAutoRefresh() {
  stopAutoRefresh();

  const intervalMs = 5 * 60 * 1000;

  refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      refreshAll();
      autoRefreshStateEl.textContent = "ON";
    } else {
      autoRefreshStateEl.textContent = "PAUSED";
    }
  }, intervalMs);

  document.addEventListener("visibilitychange", () => {
    autoRefreshStateEl.textContent = document.visibilityState === "visible" ? "ON" : "PAUSED";
  });
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

// -------------------------
// Events
// -------------------------
refreshBtn?.addEventListener("click", () => refreshAll());

// -------------------------
// Init
// -------------------------
(async function init() {
  autoRefreshStateEl.textContent = document.visibilityState === "visible" ? "ON" : "PAUSED";
  await refreshAll();
  startAutoRefresh();
})();