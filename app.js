/* =========================
   CONFIG
========================= */

// اگر Pages داری و Worker جداست، اینجا URL worker رو بگذار.
// مثال: https://cms-policy-worker.YOURNAME.workers.dev
// اگر همین دامنه هست و از pages function استفاده می‌کنی، می‌تونی خالی بذاری.
const API_BASE = ""; // "" یعنی same-origin

const STORAGE_KEY = "cms_auth_state_v1";

/* =========================
   STATE
========================= */

const state = {
  role: null,        // "parent" | "staff" | "admin"
  token: null,       // Bearer token
  campus: "WC",      // default campus
  lastAnswer: null,
};

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    role: state.role,
    token: state.token,
    campus: state.campus,
  }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    state.role = obj.role || null;
    state.token = obj.token || null;
    state.campus = obj.campus || "WC";
  } catch {}
}

function clearState() {
  state.role = null;
  state.token = null;
  saveState();
}

/* =========================
   DOM HELPERS
========================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
}

function setHtml(id, html) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = html;
}

function show(id) {
  const el = $(id);
  if (!el) return;
  el.style.display = "";
}

function hide(id) {
  const el = $(id);
  if (!el) return;
  el.style.display = "none";
}

function setDisabled(id, disabled) {
  const el = $(id);
  if (!el) return;
  el.disabled = !!disabled;
}

function toast(msg, type = "info") {
  // اگر Toast UI داری وصلش کن. فعلاً ساده:
  console.log(`[${type}]`, msg);
  const el = $("toast");
  if (el) {
    el.textContent = msg;
    el.dataset.type = type;
    el.style.opacity = "1";
    setTimeout(() => (el.style.opacity = "0"), 2500);
  } else {
    alert(msg);
  }
}

/* =========================
   API HELPERS
========================= */

function apiUrl(path) {
  if (!API_BASE) return path;
  return API_BASE.replace(/\/+$/, "") + path;
}

async function apiFetch(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set("Content-Type", "application/json");

  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  const res = await fetch(apiUrl(path), {
    ...opts,
    headers,
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error || data?.detail || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/* =========================
   ROLE-BASED UI
========================= */

function applyRoleUI() {
  // common
  setText("currentRole", state.role ? state.role.toUpperCase() : "—");
  setText("currentCampus", state.campus || "—");

  if (!state.token || !state.role) {
    // Logged out
    show("loginPanel");
    hide("appPanel");
    hide("adminPanel");
    hide("handbookPanel");
    hide("chatPanel");
    hide("staffToolsPanel");
    return;
  }

  // Logged in
  hide("loginPanel");
  show("appPanel");
  show("chatPanel");

  // Parent => فقط handbook + chat
  if (state.role === "parent") {
    show("handbookPanel");
    hide("staffToolsPanel");
    hide("adminPanel");
  }

  // Staff => handbook + chat + staff tools (اگر چیزی داری)
  if (state.role === "staff") {
    show("handbookPanel");
    show("staffToolsPanel"); // این پنل می‌تونه صرفاً پیام داشته باشه
    hide("adminPanel");
  }

  // Admin => admin panel + (اختیاری chat)
  if (state.role === "admin") {
    show("adminPanel");
    // می‌تونی اگر نمی‌خوای admin چت کنه، این خط رو عوض کنی:
    show("chatPanel");
    // handbook هم اگر خواستی admin ببینه:
    show("handbookPanel");
    show("staffToolsPanel");
  }
}

/* =========================
   LOGIN
========================= */

async function login(role) {
  try {
    setDisabled("btnLoginParent", true);
    setDisabled("btnLoginStaff", true);
    setDisabled("btnLoginAdmin", true);

    const campus = ($("campusSelect")?.value || "WC").trim().toUpperCase();
    state.campus = campus;

    if (role === "parent") {
      const code = ($("parentCode")?.value || "").trim();
      if (!code) return toast("Parent code ro وارد کن", "error");

      const data = await apiFetch("/auth/parent", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      state.role = data.role;
      state.token = data.token;
      saveState();
      toast("Parent login موفق ✅", "success");
      applyRoleUI();
      await loadHandbookList(); // فقط handbook
      return;
    }

    if (role === "staff") {
      const code = ($("staffCode")?.value || "").trim();
      if (!code) return toast("Staff code ro وارد کن", "error");

      const data = await apiFetch("/auth/staff", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      state.role = data.role;
      state.token = data.token;
      saveState();
      toast("Staff login موفق ✅", "success");
      applyRoleUI();
      await loadHandbookList();
      return;
    }

    if (role === "admin") {
      const pin = ($("adminPin")?.value || "").trim();
      if (!pin) return toast("Admin PIN ro وارد کن", "error");

      const data = await apiFetch("/auth/admin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });

      state.role = data.role;
      state.token = data.token;
      saveState();
      toast("Admin login موفق ✅", "success");
      applyRoleUI();
      await loadHandbookList();
      return;
    }
  } catch (e) {
    toast(e.message || "Login error", "error");
  } finally {
    setDisabled("btnLoginParent", false);
    setDisabled("btnLoginStaff", false);
    setDisabled("btnLoginAdmin", false);
  }
}

function logout() {
  clearState();
  toast("Logout شدی", "info");
  applyRoleUI();
}

/* =========================
   CAMPUS
========================= */

async function changeCampus(newCampus) {
  state.campus = String(newCampus || "").trim().toUpperCase() || "WC";
  saveState();
  setText("currentCampus", state.campus);

  // handbook list refresh
  if (state.token) {
    await loadHandbookList();
  }
}

/* =========================
   HANDBOOK BROWSE
   GET /handbooks?campus=WC
   GET /handbooks?campus=WC&id=...
   GET /handbooks?campus=WC&id=...&section=...
========================= */

async function loadHandbookList() {
  if (!state.token) return;

  try {
    setHtml("handbookList", "<div>Loading…</div>");

    const campus = state.campus;
    const data = await apiFetch(`/handbooks?campus=${encodeURIComponent(campus)}`, {
      method: "GET",
    });

    const list = data?.handbooks || [];
    if (!list.length) {
      setHtml("handbookList", "<div>No handbook found for this campus.</div>");
      setHtml("handbookContent", "");
      return;
    }

    const itemsHtml = list.map((hb) => {
      const title = escapeHtml(hb.title || "Parent Handbook");
      const program = escapeHtml(hb.program || "");
      const id = escapeHtml(hb.id || "");
      return `
        <div class="hb-item">
          <button class="hb-btn" data-hbid="${id}">
            ${title}${program ? ` <span class="muted">(${program})</span>` : ""}
          </button>
        </div>
      `;
    }).join("");

    setHtml("handbookList", itemsHtml);

    // bind click
    document.querySelectorAll("[data-hbid]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const hbid = btn.getAttribute("data-hbid");
        await loadHandbookFull(hbid);
      });
    });

    // auto open first
    await loadHandbookFull(list[0].id);
  } catch (e) {
    setHtml("handbookList", `<div class="error">${escapeHtml(e.message || "Error")}</div>`);
  }
}

async function loadHandbookFull(handbookId) {
  if (!state.token) return;
  if (!handbookId) return;

  try {
    setHtml("handbookContent", "<div>Loading handbook…</div>");

    const campus = state.campus;
    const data = await apiFetch(`/handbooks?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(handbookId)}`, {
      method: "GET",
    });

    const hb = data?.handbook;
    if (!hb) {
      setHtml("handbookContent", "<div>Handbook not found.</div>");
      return;
    }

    const header = `
      <h3>${escapeHtml(hb.title || "Parent Handbook")}</h3>
      ${hb.program ? `<div class="muted">${escapeHtml(hb.program)}</div>` : ""}
      ${hb.link ? `<div><a href="${escapeAttr(hb.link)}" target="_blank">Open handbook link</a></div>` : ""}
      <hr />
    `;

    const sections = Array.isArray(hb.sections) ? hb.sections : [];
    const sectionButtons = sections.map((s) => {
      const key = escapeHtml(s.key || "");
      const title = escapeHtml(s.title || key);
      return `<button class="sec-btn" data-sec="${key}" data-hbid="${escapeHtml(hb.id)}">${title}</button>`;
    }).join("");

    const body = `
      <div class="sec-list">${sectionButtons}</div>
      <div id="secView" class="sec-view"></div>
    `;

    setHtml("handbookContent", header + body);

    // bind section click (load one section)
    document.querySelectorAll("[data-sec]").forEach((b) => {
      b.addEventListener("click", async () => {
        const secKey = b.getAttribute("data-sec");
        await loadHandbookSection(handbookId, secKey);
      });
    });

    // auto open first section
    if (sections[0]?.key) {
      await loadHandbookSection(handbookId, sections[0].key);
    } else {
      setHtml("secView", "<div>No sections.</div>");
    }

  } catch (e) {
    setHtml("handbookContent", `<div class="error">${escapeHtml(e.message || "Error")}</div>`);
  }
}

async function loadHandbookSection(handbookId, sectionKey) {
  if (!state.token) return;
  if (!handbookId || !sectionKey) return;

  try {
    setHtml("secView", "<div>Loading section…</div>");

    const campus = state.campus;
    const data = await apiFetch(
      `/handbooks?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(handbookId)}&section=${encodeURIComponent(sectionKey)}`,
      { method: "GET" }
    );

    const sec = data?.section;
    if (!sec) {
      setHtml("secView", "<div>Section not found.</div>");
      return;
    }

    const content = escapeHtml(sec.content || "").replace(/\n/g, "<br/>");
    setHtml("secView", `<h4>${escapeHtml(sec.title || sec.key)}</h4><div>${content}</div>`);
  } catch (e) {
    setHtml("secView", `<div class="error">${escapeHtml(e.message || "Error")}</div>`);
  }
}

/* =========================
   CHAT (POST /api)
   body: { query, campus }
========================= */

async function sendChat() {
  if (!state.token) return toast("اول لاگین کن", "error");

  const input = $("chatInput");
  const query = (input?.value || "").trim();
  if (!query) return;

  try {
    setDisabled("btnSendChat", true);
    setHtml("chatAnswer", "<div>Thinking…</div>");

    const data = await apiFetch("/api", {
      method: "POST",
      body: JSON.stringify({
        query,
        campus: state.campus
      }),
    });

    // Worker output
    const answer = data?.answer || "";
    const reason = data?.match_reason || "";
    const source = data?.source;

    const sourceHtml = source
      ? `<div class="muted">Source: ${escapeHtml(source.type)} | ${escapeHtml(source.title || source.id)}</div>`
      : `<div class="muted">Source: none</div>`;

    // Parent: فقط handbook میاد. Staff: ممکنه policy/protocol هم بیاد.
    // UI restriction: برای Parent حتی اگر source.type غیر handbook شد (نباید بشه)، نمایش می‌دیم ولی هشدار می‌ذاریم.
    let guardNote = "";
    if (state.role === "parent" && source && source.type !== "handbook") {
      guardNote = `<div class="warn">⚠️ Parent باید فقط handbook ببینه. لطفاً Worker role-filter رو چک کن.</div>`;
    }

    const handbookSection = data?.handbook_section;
    let sectionHtml = "";
    if (handbookSection?.section_content) {
      const secContent = escapeHtml(handbookSection.section_content).replace(/\n/g, "<br/>");
      sectionHtml = `
        <details open>
          <summary>Matched Handbook Section: ${escapeHtml(handbookSection.section_title || handbookSection.section_key || "")}</summary>
          <div style="margin-top:8px">${secContent}</div>
        </details>
      `;
    }

    setHtml("chatAnswer",
      `
        ${guardNote}
        <div class="answer">${escapeHtml(answer)}</div>
        ${sectionHtml}
        ${sourceHtml}
        ${reason ? `<div class="muted">Match reason: ${escapeHtml(reason)}</div>` : ""}
      `
    );

    input.value = "";
  } catch (e) {
    setHtml("chatAnswer", `<div class="error">${escapeHtml(e.message || "Error")}</div>`);
  } finally {
    setDisabled("btnSendChat", false);
  }
}

/* =========================
   ADMIN (optional)
========================= */

async function loadAdminLogs() {
  if (state.role !== "admin") return toast("Admin only", "error");

  try {
    setHtml("adminOutput", "<div>Loading logs…</div>");
    const data = await apiFetch("/admin/logs?limit=120", { method: "GET" });

    const logs = Array.isArray(data.logs) ? data.logs : [];
    const rows = logs.map((l) => {
      const t = new Date(l.ts || Date.now()).toLocaleString();
      return `
        <tr>
          <td>${escapeHtml(t)}</td>
          <td>${escapeHtml(l.campus || "")}</td>
          <td>${escapeHtml(l.user_role || "")}</td>
          <td>${escapeHtml(String(l.ok))}</td>
          <td>${escapeHtml(String(l.ms || ""))}</td>
          <td>${escapeHtml(l.source_type || "")}</td>
          <td>${escapeHtml(l.source_id || "")}</td>
          <td>${escapeHtml(l.section_key || "")}</td>
          <td>${escapeHtml(l.query || "")}</td>
        </tr>
      `;
    }).join("");

    setHtml("adminOutput", `
      <table class="tbl">
        <thead>
          <tr>
            <th>Time</th><th>Campus</th><th>Role</th><th>OK</th><th>ms</th>
            <th>Type</th><th>SourceID</th><th>Section</th><th>Query</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  } catch (e) {
    setHtml("adminOutput", `<div class="error">${escapeHtml(e.message || "Error")}</div>`);
  }
}

async function loadAdminStats() {
  if (state.role !== "admin") return toast("Admin only", "error");

  try {
    setHtml("adminStats", "<div>Loading stats…</div>");
    const data = await apiFetch("/admin/stats?limit=200", { method: "GET" });

    setHtml("adminStats", `
      <div><b>Badge:</b> ${escapeHtml(data.badge || "")}</div>
      <div><b>Total:</b> ${escapeHtml(String(data.total || 0))}</div>
      <div><b>OK:</b> ${escapeHtml(String(data.ok || 0))}</div>
      <div><b>Bad:</b> ${escapeHtml(String(data.bad || 0))}</div>
      <div><b>Avg ms:</b> ${escapeHtml(String(data.avg_ms || 0))}</div>
      <pre>${escapeHtml(JSON.stringify({ byCampus: data.byCampus, byRole: data.byRole, bySourceType: data.bySourceType }, null, 2))}</pre>
    `);
  } catch (e) {
    setHtml("adminStats", `<div class="error">${escapeHtml(e.message || "Error")}</div>`);
  }
}

/* =========================
   UTILS (escape)
========================= */

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(s) {
  // برای href
  return escapeHtml(s).replaceAll("`", "&#096;");
}

/* =========================
   BIND EVENTS
========================= */

function bindEvents() {
  // campus
  const campusSelect = $("campusSelect");
  if (campusSelect) {
    campusSelect.value = state.campus || "WC";
    campusSelect.addEventListener("change", async () => {
      await changeCampus(campusSelect.value);
    });
  }

  // login buttons
  $("btnLoginParent")?.addEventListener("click", () => login("parent"));
  $("btnLoginStaff")?.addEventListener("click", () => login("staff"));
  $("btnLoginAdmin")?.addEventListener("click", () => login("admin"));

  // logout
  $("btnLogout")?.addEventListener("click", logout);

  // chat
  $("btnSendChat")?.addEventListener("click", sendChat);
  $("chatInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  // admin
  $("btnLoadLogs")?.addEventListener("click", loadAdminLogs);
  $("btnLoadStats")?.addEventListener("click", loadAdminStats);
}

/* =========================
   INIT
========================= */

async function init() {
  loadState();
  bindEvents();
  applyRoleUI();

  // اگر قبلاً لاگین بوده، handbook list رو بیار
  if (state.token && state.role) {
    try {
      await loadHandbookList();
    } catch {}
  }
}

document.addEventListener("DOMContentLoaded", init);