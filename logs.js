// ================= CONFIG =================
const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";

// ================= DOM =================
const adminCodeEl = document.getElementById("admin-code");
const loadBtn = document.getElementById("load-logs-btn");
const adminErrorEl = document.getElementById("admin-error");

const dashboardSection = document.getElementById("dashboard-section");
const filtersSection = document.getElementById("filters-section");
const logsSection = document.getElementById("logs-section");

const alertBoxEl = document.getElementById("alert-box");
const dashBadgeEl = document.getElementById("dash-badge");
const lastRefreshEl = document.getElementById("last-refresh");

// dashboard quick stats
const statTotalEl = document.getElementById("stat-total");
const statErrorsEl = document.getElementById("stat-errors");
const statErrPctEl = document.getElementById("stat-errpct");
const statAvgMsEl = document.getElementById("stat-avgms");

// filters
const campusEl = document.getElementById("filter-campus");
const roleEl = document.getElementById("filter-role");
const dateEl = document.getElementById("filter-date");
const searchEl = document.getElementById("filter-search");

// logs table
const logsBodyEl = document.getElementById("logs-body");

// chart
const trendCanvas = document.getElementById("trendChart");

// ================= STATE =================
let loadedLogs = [];
let lastTrendSeries = [];
let autoRefreshTimer = null;
let autoRefreshEnabled = false;

// Tooltip state
let tooltip = { active: false, idx: -1 };

// ================= HELPERS =================
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clampInt(v, fallback) {
  const n = parseInt(String(v || "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function setAdminError(msg) {
  adminErrorEl.textContent = msg || "";
}

function showAlert(type, html) {
  alertBoxEl.classList.remove("hidden", "ok", "warn", "bad");
  alertBoxEl.classList.add(type);
  alertBoxEl.innerHTML = html;
  setBadgeFromAlert();
}

function hideAlert() {
  alertBoxEl.classList.add("hidden");
  alertBoxEl.classList.remove("ok", "warn", "bad");
  alertBoxEl.innerHTML = "";
  setBadgeFromAlert();
}

function setBadgeFromAlert() {
  if (!dashBadgeEl) return;

  if (alertBoxEl.classList.contains("bad")) {
    dashBadgeEl.textContent = "BAD";
    dashBadgeEl.classList.remove("neutral", "ok", "warn");
    dashBadgeEl.classList.add("bad");
    return;
  }
  if (alertBoxEl.classList.contains("warn")) {
    dashBadgeEl.textContent = "WARN";
    dashBadgeEl.classList.remove("neutral", "ok", "bad");
    dashBadgeEl.classList.add("warn");
    return;
  }
  if (alertBoxEl.classList.contains("ok")) {
    dashBadgeEl.textContent = "OK";
    dashBadgeEl.classList.remove("neutral", "warn", "bad");
    dashBadgeEl.classList.add("ok");
    return;
  }

  dashBadgeEl.textContent = "—";
  dashBadgeEl.classList.remove("ok", "warn", "bad");
  dashBadgeEl.classList.add("neutral");
}

function setLastRefreshNow() {
  if (!lastRefreshEl) return;
  lastRefreshEl.textContent = new Date().toLocaleString();
}

function toYmd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayLocalYmd() {
  return toYmd(new Date());
}

function ymdToKey(ymd) {
  // "YYYY-MM-DD" -> "YYYYMMDD"
  return String(ymd || "").replaceAll("-", "");
}

// ================= RENDER =================
function renderLogsTable(logs) {
  const term = (searchEl.value || "").trim().toLowerCase();
  const filtered = term
    ? logs.filter((l) => String(l.query || "").toLowerCase().includes(term))
    : logs;

  logsBodyEl.innerHTML = "";

  if (!filtered.length) {
    logsBodyEl.innerHTML = `<tr><td colspan="6" style="color:#6b7280;">No logs.</td></tr>`;
    return;
  }

  filtered.forEach((l) => {
    const tr = document.createElement("tr");
    const ok = !!l.ok;

    tr.innerHTML = `
      <td>${escapeHtml(l.ts || "-")}</td>
      <td>${escapeHtml(l.campus || "-")}</td>
      <td>${escapeHtml(l.role || "-")}</td>
      <td style="max-width:420px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${escapeHtml(l.query || "")}
      </td>
      <td><span class="pill ${ok ? "ok" : "bad"}">${ok ? "OK" : "ERR"}</span></td>
      <td>${escapeHtml(l.ms ?? "-")}</td>
    `;
    logsBodyEl.appendChild(tr);
  });
}

function computeDashboard(logs) {
  const total = logs.length;
  const errCount = logs.filter((l) => !l.ok).length;
  const errPct = total ? Math.round((errCount / total) * 100) : 0;

  const msList = logs.map((l) => Number(l.ms)).filter((x) => Number.isFinite(x));
  const avgMs = msList.length
    ? Math.round(msList.reduce((a, b) => a + b, 0) / msList.length)
    : 0;

  statTotalEl.textContent = String(total);
  statErrorsEl.textContent = String(errCount);
  statErrPctEl.textContent = `${errPct}%`;
  statAvgMsEl.textContent = String(avgMs);

  return { total, errCount, errPct, avgMs };
}

// ================= BALANCED ALERTS =================
function predictiveAlert(series) {
  if (!series || series.length < 7) return null;

  const tail = series.slice(-5);
  const err = tail.map((s) => s.errPct);
  const ms = tail.map((s) => s.avgMs);
  const total = tail.map((s) => s.total);

  const slopeErr = (err[err.length - 1] - err[0]) / (err.length - 1);
  const slopeMs = (ms[ms.length - 1] - ms[0]) / (ms.length - 1);

  const avgDaily = total.reduce((a, b) => a + b, 0) / total.length;
  if (avgDaily < 5) return null; // Balanced: ignore low traffic

  const today = series[series.length - 1];
  const todayErr = today.errPct;
  const todayMs = today.avgMs;

  const risingErr = slopeErr >= 2 && todayErr >= 6;      // +2%/day AND today >= 6%
  const risingMs = slopeMs >= 250 && todayMs >= 1200;    // +250ms/day AND today >= 1200ms

  if (risingErr && risingMs) {
    return {
      type: "bad",
      msg: `📈 Predictive alert: <b>ERR%</b> and <b>latency</b> are trending up (last 5 days). Today ERR%=${todayErr}%, AvgMs=${todayMs}.`
    };
  }
  if (risingErr) {
    return {
      type: "warn",
      msg: `📈 Predictive warning: <b>ERR%</b> rising (≈ +${slopeErr.toFixed(1)}%/day). Today ERR%=${todayErr}%.`
    };
  }
  if (risingMs) {
    return {
      type: "warn",
      msg: `📈 Predictive warning: <b>Avg latency</b> rising (≈ +${Math.round(slopeMs)}ms/day). Today AvgMs=${todayMs}.`
    };
  }
  return null;
}

function applyAlerts(logs) {
  hideAlert();

  const total = logs.length;
  if (!total) {
    showAlert("warn", "No logs loaded.");
    return;
  }

  // Stability: if worker adds error_type="ai_non_json"
  const nonJSON = logs.filter((l) => l.error_type === "ai_non_json").length;

  if (nonJSON >= 2) {
    showAlert("bad", `🚨 Stability alert: <b>${nonJSON}</b> AI non-JSON errors detected. Fix prompt/JSON enforcement.`);
    return;
  }
  if (nonJSON === 1) {
    showAlert("warn", `⚠️ Stability warning: <b>1</b> AI non-JSON error detected. Watch formatting drift.`);
    // continue to health check too
  }

  // Health checks (Balanced)
  const errCount = logs.filter((l) => !l.ok).length;
  const errPct = total ? Math.round((errCount / total) * 100) : 0;

  // "slow" threshold
  const slowThreshold = 2500;
  const slowCount = logs.filter((l) => Number(l.ms) >= slowThreshold).length;

  if (errCount === 0 && slowCount === 0 && nonJSON === 0) {
    showAlert("ok", `✅ Healthy: No errors and no slow responses (≥${slowThreshold}ms).`);
    return;
  }

  if (errPct >= 10 || errCount >= 3) {
    showAlert(
      "bad",
      `🚨 Health alert: <b>${errCount}</b> errors out of <b>${total}</b> (<b>${errPct}%</b>). Slow=<b>${slowCount}</b> (≥${slowThreshold}ms).`
    );
    return;
  }

  if ((errPct >= 5 && errPct < 10) || slowCount >= 5 || nonJSON === 1) {
    const extra = nonJSON === 1 ? `<br><br>Also: 1 AI non-JSON formatting issue detected.` : "";
    showAlert(
      "warn",
      `⚠️ Health warning: ERR=<b>${errCount}</b> (${errPct}%), Slow=<b>${slowCount}</b> (≥${slowThreshold}ms).${extra}`
    );
    return;
  }

  showAlert("warn", `⚠️ Attention: ERR=<b>${errCount}</b> (${errPct}%), Slow=<b>${slowCount}</b> (≥${slowThreshold}ms).`);
}

// ================= API CALLS =================
async function fetchAdminLogs() {
  const adminCode = adminCodeEl.value.trim();
  if (!adminCode) throw new Error("Missing admin code.");

  const dateKey = ymdToKey(dateEl.value || "");
  const params = new URLSearchParams();

  // Worker expects YYYYMMDD
  params.set("date", dateKey || "");
  if (campusEl.value) params.set("campus", campusEl.value);
  if (roleEl.value) params.set("role", roleEl.value);
  params.set("limit", "80");

  const url = `${WORKER_BASE}/admin/logs?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "x-admin-code": adminCode }
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }

  const data = await res.json();
  return data.logs || [];
}

async function fetchAdminStats7d() {
  const adminCode = adminCodeEl.value.trim();
  if (!adminCode) return [];

  const params = new URLSearchParams();
  params.set("days", "7");
  if (campusEl.value) params.set("campus", campusEl.value);
  if (roleEl.value) params.set("role", roleEl.value);

  const url = `${WORKER_BASE}/admin/stats?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "x-admin-code": adminCode }
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.series || [];
}

// ================= CANVAS CHART + TOOLTIP =================
function drawTrendChart(series) {
  if (!trendCanvas) return;
  const ctx = trendCanvas.getContext("2d");

  const cssW = trendCanvas.clientWidth || 600;
  const cssH = 140;

  trendCanvas.width = Math.floor(cssW * devicePixelRatio);
  trendCanvas.height = Math.floor(cssH * devicePixelRatio);

  const w = trendCanvas.width;
  const h = trendCanvas.height;

  ctx.clearRect(0, 0, w, h);

  const padding = 28 * devicePixelRatio;
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;

  // axes
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1 * devicePixelRatio;
  ctx.strokeStyle = "#d7deea";
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, h - padding);
  ctx.lineTo(w - padding, h - padding);
  ctx.stroke();

  if (!series || !series.length) {
    ctx.fillStyle = "#6b7280";
    ctx.font = `${12 * devicePixelRatio}px system-ui`;
    ctx.fillText("No data", padding, padding + 20 * devicePixelRatio);
    return;
  }

  const totals = series.map((s) => s.total);
  const errPcts = series.map((s) => s.errPct);
  const avgMs = series.map((s) => s.avgMs);

  const maxTotal = Math.max(1, ...totals);
  const maxMs = Math.max(1, ...avgMs);

  const n = series.length;
  const xs = series.map((_, i) => padding + (i * innerW) / (n - 1));

  const yTotal = (v) => (h - padding) - (v / maxTotal) * innerH;
  const yMs = (v) => (h - padding) - (v / maxMs) * innerH;
  const yErr = (v) => (h - padding) - (v / 100) * innerH;

  ctx.strokeStyle = "#003b8e";
  ctx.lineWidth = 2 * devicePixelRatio;

  // Total (dark)
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  xs.forEach((x, i) => {
    const y = yTotal(totals[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // ERR% (mid)
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  xs.forEach((x, i) => {
    const y = yErr(errPcts[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Avg ms (light)
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  xs.forEach((x, i) => {
    const y = yMs(avgMs[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // labels
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#6b7280";
  ctx.font = `${11 * devicePixelRatio}px system-ui`;
  series.forEach((s, i) => {
    const label = String(s.date || "").slice(4); // MMDD
    if (i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2)) {
      ctx.fillText(label, xs[i] - 10 * devicePixelRatio, h - padding + 16 * devicePixelRatio);
    }
  });

  // legend
  ctx.fillStyle = "#1f2933";
  ctx.font = `${12 * devicePixelRatio}px system-ui`;
  ctx.fillText("Total (dark) • ERR% (mid) • Avg ms (light)", padding, padding - 10 * devicePixelRatio);

  // tooltip overlay
  if (tooltip.active && tooltip.idx >= 0 && tooltip.idx < series.length) {
    drawTooltip(ctx, series, xs, tooltip.idx, { w, h, padding });
  }
}

function drawTooltip(ctx, series, xs, idx, dim) {
  const { w, h, padding } = dim;
  const s = series[idx];
  const x = xs[idx];

  ctx.save();

  // vertical guide
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#003b8e";
  ctx.lineWidth = 1 * devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(x, padding);
  ctx.lineTo(x, h - padding);
  ctx.stroke();

  // dot
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#003b8e";
  ctx.beginPath();
  ctx.arc(x, h - padding, 3.5 * devicePixelRatio, 0, Math.PI * 2);
  ctx.fill();

  const lines = [
    `Date: ${s.date}`,
    `Total: ${s.total}`,
    `ERR%: ${s.errPct}% (${s.err})`,
    `Avg ms: ${s.avgMs}`
  ];

  ctx.globalAlpha = 1;
  ctx.font = `${12 * devicePixelRatio}px system-ui`;
  const maxWidth = Math.max(...lines.map((t) => ctx.measureText(t).width));
  const boxPad = 10 * devicePixelRatio;
  const lineH = 16 * devicePixelRatio;
  const boxW = maxWidth + boxPad * 2;
  const boxH = lines.length * lineH + boxPad * 1.6;

  let bx = x + 10 * devicePixelRatio;
  let by = padding + 8 * devicePixelRatio;
  if (bx + boxW > w - padding) bx = x - boxW - 10 * devicePixelRatio;

  // box
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "#d7deea";
  ctx.lineWidth = 1 * devicePixelRatio;
  roundRect(ctx, bx, by, boxW, boxH, 10 * devicePixelRatio);
  ctx.fill();
  ctx.stroke();

  // text
  ctx.fillStyle = "#1f2933";
  lines.forEach((t, i) => {
    ctx.fillText(t, bx + boxPad, by + boxPad + (i + 1) * lineH);
  });

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function getNearestIndexFromEvent(e, series) {
  const rect = trendCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const xCss = clientX - rect.left;

  const paddingCss = 28;
  const innerWCss = rect.width - paddingCss * 2;
  if (innerWCss <= 0) return -1;

  const t = (xCss - paddingCss) / innerWCss;
  const clamped = Math.max(0, Math.min(1, t));
  return Math.round(clamped * (series.length - 1));
}

// ================= AUTO REFRESH (VISIBLE ONLY) =================
function canAutoRefresh() {
  return autoRefreshEnabled && document.visibilityState === "visible" && document.hasFocus();
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshEnabled = true;

  autoRefreshTimer = setInterval(async () => {
    if (!canAutoRefresh()) return;
    await loadAll(true);
  }, 5 * 60 * 1000); // ✅ 5 minutes
}

function stopAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

// ================= MAIN LOAD =================
async function loadAll(isAuto = false) {
  setAdminError("");

  const code = adminCodeEl.value.trim();
  if (!code) {
    setAdminError("Please enter admin code.");
    return;
  }
  localStorage.setItem("cmsAdminCode", code);

  if (!isAuto) {
    // reveal sections
    dashboardSection.classList.remove("hidden");
    filtersSection.classList.remove("hidden");
    logsSection.classList.remove("hidden");
  }

  // Load logs
  try {
    loadedLogs = await fetchAdminLogs();
  } catch (err) {
    showAlert("bad", `❌ Failed to load logs: ${escapeHtml(err.message)}`);
    return;
  }

  // Dashboard + alerts
  computeDashboard(loadedLogs);
  applyAlerts(loadedLogs);

  // Render table
  renderLogsTable(loadedLogs);

  // Trend
  lastTrendSeries = await fetchAdminStats7d();
  drawTrendChart(lastTrendSeries);

  // Predictive (append if not BAD already)
  const pred = predictiveAlert(lastTrendSeries);
  if (pred && !alertBoxEl.classList.contains("bad")) {
    showAlert(pred.type, `${alertBoxEl.innerHTML}<br><br>${pred.msg}`);
  }

  setLastRefreshNow();
  setBadgeFromAlert();

  if (!isAuto) startAutoRefresh();
}

// ================= INIT =================
(function init() {
  // restore admin code
  adminCodeEl.value = localStorage.getItem("cmsAdminCode") || "";

  // default date = today
  dateEl.value = todayLocalYmd();

  // Load btn
  loadBtn.addEventListener("click", async () => {
    hideAlert();
    await loadAll(false);
  });

  // Filters: re-load on change (but keep it light; no reload on each search keystroke)
  campusEl.addEventListener("change", () => loadAll(false));
  roleEl.addEventListener("change", () => loadAll(false));
  dateEl.addEventListener("change", () => loadAll(false));

  // Search is client-only filter
  searchEl.addEventListener("input", () => renderLogsTable(loadedLogs));

  // Visibility/focus immediate refresh when returning
  document.addEventListener("visibilitychange", async () => {
    if (canAutoRefresh()) await loadAll(true);
  });
  window.addEventListener("focus", async () => {
    if (canAutoRefresh()) await loadAll(true);
  });

  // Tooltip events
  if (trendCanvas) {
    trendCanvas.addEventListener("mousemove", (e) => {
      if (!lastTrendSeries.length) return;
      tooltip.active = true;
      tooltip.idx = getNearestIndexFromEvent(e, lastTrendSeries);
      drawTrendChart(lastTrendSeries);
    });

    trendCanvas.addEventListener("mouseleave", () => {
      tooltip.active = false;
      tooltip.idx = -1;
      drawTrendChart(lastTrendSeries);
    });

    trendCanvas.addEventListener("touchstart", (e) => {
      if (!lastTrendSeries.length) return;
      tooltip.active = true;
      tooltip.idx = getNearestIndexFromEvent(e, lastTrendSeries);
      drawTrendChart(lastTrendSeries);
    }, { passive: true });

    trendCanvas.addEventListener("touchmove", (e) => {
      if (!lastTrendSeries.length) return;
      tooltip.active = true;
      tooltip.idx = getNearestIndexFromEvent(e, lastTrendSeries);
      drawTrendChart(lastTrendSeries);
    }, { passive: true });

    trendCanvas.addEventListener("touchend", () => {
      tooltip.active = false;
      tooltip.idx = -1;
      drawTrendChart(lastTrendSeries);
    });
  }
})();
