/* =========================
   app.js (FULL)
   - Staff + Parent login
   - Role-based UI (Parent: Handbook only | Staff: Policies/Protocols/Handbook | Admin: links)
   - Uses same-origin /api (Cloudflare Pages Function) + sends Authorization header
   - Handbook modal:
       • Search
       • Accordion sections
       • Quick Ask (sends question)
       • Copy Link (deep link with #hb=...&sec=...)
   ========================= */

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";

// Endpoints (Worker)
const AUTH_STAFF_URL = `${WORKER_BASE}/auth/staff`;
const AUTH_PARENT_URL = `${WORKER_BASE}/auth/parent`;
const AUTH_ADMIN_URL  = `${WORKER_BASE}/auth/admin`;

const HANDBOOKS_URL   = `${WORKER_BASE}/handbooks`; // GET ?campus=MC

// These two are best-effort (depends on your Worker routes)
const POLICIES_LIST_URL  = `${WORKER_BASE}/policies`;   // GET ?campus=MC
const PROTOCOLS_LIST_URL = `${WORKER_BASE}/protocols`;  // GET ?campus=MC

// Pages Function proxy (same-origin) -> forwards to WORKER /api
const API_PROXY = `/api`;

const LS = {
  role:       "cms_role",          // "parent" | "staff" | "admin"
  campus:     "cms_campus",

  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",

  parentToken:"cms_parent_token",
  parentUntil:"cms_parent_until",

  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

// -------------------------
// DOM helpers
// -------------------------
const el = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

const loginScreen = el("login-screen");
const chatScreen  = el("chat-screen");

const loginForm   = el("login-form");
const accessCode  = el("access-code");
const campusSelect= el("campus-select");
const campusSwitch= el("campus-switch");
const campusPreview = el("campus-preview");
const loginError  = el("login-error");

const headerActions = el("header-actions");
const topMenuBar    = el("top-menu-bar");

const adminModeBtn = el("admin-mode-btn");
const modeBadge    = el("mode-badge");
const logoutBtn    = el("logout-btn");
const adminLinks   = el("admin-links");

const chatWindow = el("chat-window");
const chatForm   = el("chat-form");
const userInput  = el("user-input");

const menuOverlay   = el("menu-overlay");
const menuPanel     = el("menu-panel");
const menuPanelTitle= el("menu-panel-title");
const menuPanelBody = el("menu-panel-body");
const menuPanelClose= el("menu-panel-close");

const adminModal     = el("admin-modal");
const adminPinInput  = el("admin-pin");
const adminPinCancel = el("admin-pin-cancel");
const adminPinSubmit = el("admin-pin-submit");

const loginAdminBtn  = el("login-admin-btn");

let CURRENT_MENU = null; // "policies" | "protocols" | "handbook"
let HANDBOOK_CACHE = []; // loaded list for current campus

// -------------------------
// Utils
// -------------------------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function nowMs() { return Date.now(); }

function setCampus(c) {
  const campus = String(c || "").toUpperCase();
  if (campus) localStorage.setItem(LS.campus, campus);
  if (campusSelect) campusSelect.value = campus;
  if (campusSwitch) campusSwitch.value = campus;
  if (campusPreview) campusPreview.textContent = campus || "—";
}

function getCampus() {
  return (localStorage.getItem(LS.campus) || campusSelect?.value || campusSwitch?.value || "").toUpperCase();
}

function setRole(role) {
  localStorage.setItem(LS.role, role);
}

function getRole() {
  return (localStorage.getItem(LS.role) || "").toLowerCase();
}

function clearSession() {
  Object.values(LS).forEach((k) => localStorage.removeItem(k));
}

function setLoginError(msg) {
  if (!loginError) return;
  loginError.textContent = msg || "";
}

function showScreens(isLoggedIn) {
  if (isLoggedIn) {
    loginScreen?.classList.add("hidden");
    chatScreen?.classList.remove("hidden");
    headerActions?.classList.remove("hidden");
    topMenuBar?.classList.remove("hidden");
  } else {
    loginScreen?.classList.remove("hidden");
    chatScreen?.classList.add("hidden");
    headerActions?.classList.add("hidden");
    topMenuBar?.classList.add("hidden");
  }
}

// -------------------------
// Token helpers
// -------------------------
function tokenKeyForRole(role) {
  if (role === "admin") return LS.adminToken;
  if (role === "staff") return LS.staffToken;
  if (role === "parent")return LS.parentToken;
  return "";
}
function untilKeyForRole(role) {
  if (role === "admin") return LS.adminUntil;
  if (role === "staff") return LS.staffUntil;
  if (role === "parent")return LS.parentUntil;
  return "";
}

function isTokenActive(role) {
  const tKey = tokenKeyForRole(role);
  const uKey = untilKeyForRole(role);
  if (!tKey || !uKey) return false;

  const token = localStorage.getItem(tKey) || "";
  const until = Number(localStorage.getItem(uKey) || "0");
  return !!token && nowMs() < until;
}

function getActiveToken() {
  // priority: admin > staff > parent
  if (isTokenActive("admin")) return { role: "admin", token: localStorage.getItem(LS.adminToken) || "" };
  if (isTokenActive("staff")) return { role: "staff", token: localStorage.getItem(LS.staffToken) || "" };
  if (isTokenActive("parent"))return { role: "parent", token: localStorage.getItem(LS.parentToken) || "" };
  return { role: "", token: "" };
}

function setToken(role, token, expiresInSeconds = 28800) {
  const tKey = tokenKeyForRole(role);
  const uKey = untilKeyForRole(role);
  if (!tKey || !uKey) return;

  localStorage.setItem(tKey, token);
  localStorage.setItem(uKey, String(nowMs() + Number(expiresInSeconds || 28800) * 1000));
  setRole(role);
}

// -------------------------
// Auth fetch (IMPORTANT)
// -------------------------
async function authFetch(url, options = {}) {
  // Determine which token to use:
  // - If user is in admin mode (active), use admin token
  // - else use role token (staff/parent)
  const active = getActiveToken();
  const token = active.token || "";

  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.method && options.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...options, headers });

  // If unauthorized: keep UI clean + force logout to re-login
  if (res.status === 401) {
    // do not clear admin automatically if admin is active and user is just parent/staff
    // but if the active token itself failed => clear all
    const txt = await res.text().catch(() => "");
    console.warn("401:", txt);
  }
  return res;
}

async function readJson(res) {
  return await res.json().catch(() => ({}));
}

// -------------------------
// UI: role-based visibility
// -------------------------
function applyRoleUI() {
  const role = getRole();
  const isAdmin = isTokenActive("admin");

  // Mode badge
  if (modeBadge) {
    const label = (isAdmin ? "ADMIN" : (role || "STAFF")).toUpperCase();
    modeBadge.textContent = label;
    modeBadge.classList.toggle("admin", isAdmin);
  }

  // Admin links in top menu
  if (adminLinks) {
    adminLinks.classList.toggle("hidden", !isAdmin);
  }

  // Top menu buttons
  const policiesBtn  = qs('[data-menu="policies"]');
  const protocolsBtn = qs('[data-menu="protocols"]');
  const handbookBtn  = qs('[data-menu="handbook"]');

  // Default show all for staff/admin, handbook always for staff+parent
  const parentOnly = role === "parent" && !isAdmin;

  if (policiesBtn)  policiesBtn.style.display  = parentOnly ? "none" : "inline-flex";
  if (protocolsBtn) protocolsBtn.style.display = parentOnly ? "none" : "inline-flex";
  if (handbookBtn)  handbookBtn.style.display  = "inline-flex";

  // If parent: force current menu to handbook
  if (parentOnly) {
    setActiveMenuPill("handbook");
  }
}

function setActiveMenuPill(menuName) {
  qsa(".menu-pill").forEach(btn => {
    const is = btn.getAttribute("data-menu") === menuName;
    btn.classList.toggle("active", is);
  });
}

// -------------------------
// Chat rendering
// -------------------------
function addMsg(role, text) {
  if (!chatWindow) return;
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "assistant"}`;
  div.innerHTML = linkify(escapeHtml(String(text || "")));
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addTyping() {
  if (!chatWindow) return null;
  const wrap = document.createElement("div");
  wrap.className = "typing-bubble";
  wrap.innerHTML = `
    <div class="typing-dots">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return wrap;
}

function linkify(s) {
  // simple URL linkify
  return s.replace(
    /(https?:\/\/[^\s<]+)/g,
    (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`
  );
}

// -------------------------
// Login
// -------------------------
async function loginWithCode(code, campus) {
  const payload = { code: String(code || "").trim(), campus: String(campus || "").trim().toUpperCase() };

  // Try staff first, then parent (so staff codes work even if they look similar)
  // If your worker ONLY has /auth/staff and /auth/parent, this will work.
  // If you only have /auth/staff that accepts both, you can simplify later.
  {
    const res = await fetch(AUTH_STAFF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await readJson(res);
    if (res.ok && data.ok) {
      setToken("staff", data.token, data.expires_in || 28800);
      setCampus(payload.campus);
      return { ok: true, role: "staff" };
    }
  }

  {
    const res = await fetch(AUTH_PARENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await readJson(res);
    if (res.ok && data.ok) {
      setToken("parent", data.token, data.expires_in || 28800);
      setCampus(payload.campus);
      return { ok: true, role: "parent" };
    }
  }

  return { ok: false, error: "Invalid access code." };
}

// -------------------------
// Admin mode
// -------------------------
function openAdminModal() {
  if (!adminModal) return;
  adminModal.classList.remove("hidden");
  adminModal.setAttribute("aria-hidden", "false");
  setTimeout(() => adminPinInput?.focus(), 50);
}

function closeAdminModal() {
  if (!adminModal) return;
  adminModal.classList.add("hidden");
  adminModal.setAttribute("aria-hidden", "true");
  if (adminPinInput) adminPinInput.value = "";
}

async function loginAdmin(pin) {
  const res = await fetch(AUTH_ADMIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: String(pin || "").trim() })
  });
  const data = await readJson(res);

  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || "Admin PIN invalid." };
  }

  setToken("admin", data.token, data.expires_in || 28800);
  return { ok: true };
}

// -------------------------
// Menu panel modal
// -------------------------
function openMenuPanel(title) {
  if (!menuOverlay || !menuPanel) return;
  menuPanelTitle.textContent = title || "Menu";
  menuOverlay.classList.remove("hidden");
  menuPanel.classList.remove("hidden");
  menuPanel.setAttribute("aria-hidden", "false");
}

function closeMenuPanel() {
  if (!menuOverlay || !menuPanel) return;
  menuOverlay.classList.add("hidden");
  menuPanel.classList.add("hidden");
  menuPanel.setAttribute("aria-hidden", "true");
  menuPanelBody.innerHTML = "";
  CURRENT_MENU = null;
  // Clear hash if it was handbook deep-link
  // (keep if user wants shareable links; we only clear when user closes)
  // window.location.hash = "";
}

// -------------------------
// Handbook UI (Search + Accordion + Quick Ask + Copy Link)
// -------------------------
function parseHash() {
  const h = String(window.location.hash || "").replace(/^#/, "");
  const params = new URLSearchParams(h);
  const hb = params.get("hb") || "";
  const sec = params.get("sec") || "";
  return { hb, sec };
}

function setHash(hbId, secKey) {
  const params = new URLSearchParams();
  if (hbId) params.set("hb", hbId);
  if (secKey) params.set("sec", secKey);
  window.location.hash = params.toString();
}

async function loadHandbooksForCampus(campus) {
  const c = String(campus || "").toUpperCase();
  if (!c) return [];

  const url = `${HANDBOOKS_URL}?campus=${encodeURIComponent(c)}`;
  const res = await authFetch(url, { method: "GET" });
  const data = await readJson(res);

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to load handbooks");
  }
  const list = Array.isArray(data.handbooks) ? data.handbooks : [];
  return list;
}

function renderHandbookPanel(handbooks, campus) {
  // Header + search
  const campusTxt = escapeHtml(campus || "—");

  menuPanelBody.innerHTML = `
    <div class="menu-group-label">Parent Handbook (Campus-based)</div>
    <div class="small muted" style="margin-bottom:10px;">
      Current campus: <b>${campusTxt}</b>
    </div>

    <input id="hb-search" class="text-input" style="height:42px;border-radius:14px;margin-bottom:12px;"
           placeholder="Search handbook titles or section titles…" />

    <div id="hb-list"></div>

    <div class="small muted" style="margin-top:10px;">
      Tip: Use Search to quickly find a section, then Quick Ask to ask about it.
    </div>
  `;

  const listEl = el("hb-list");
  const searchEl = el("hb-search");

  function matches(hb, q) {
    if (!q) return true;
    const hay = [
      hb.title, hb.program, hb.campus,
      ...(Array.isArray(hb.sections) ? hb.sections.map(s => s.title) : [])
    ].join(" ").toLowerCase();
    return hay.includes(q);
  }

  function buildAccordionHTML(hb) {
    const hbId = hb.id || "";
    const sections = Array.isArray(hb.sections) ? hb.sections : [];
    const secHtml = sections.map((s, idx) => {
      const secKey = s.key || `sec_${idx}`;
      const title = escapeHtml(s.title || secKey);
      const content = escapeHtml(s.content || "");

      return `
        <div class="acc-item" data-hb="${escapeHtml(hbId)}" data-sec="${escapeHtml(secKey)}" style="border:1px solid var(--line);border-radius:14px;margin-top:10px;overflow:hidden;">
          <button class="acc-header" type="button"
            style="width:100%;text-align:left;padding:12px 12px;background:#f7f9fe;border:0;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
            <span>${title}</span>
            <span class="muted" style="font-weight:900;">+</span>
          </button>

          <div class="acc-body" style="display:none;padding:12px 12px;background:#fff;">
            <div style="white-space:pre-wrap;line-height:1.4;">${content}</div>

            <div class="acc-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
              <button class="pill-btn acc-quickask" type="button" data-hb="${escapeHtml(hbId)}" data-sec="${escapeHtml(secKey)}" data-title="${title}">
                Quick Ask
              </button>
              <button class="pill-btn acc-copylink" type="button" data-hb="${escapeHtml(hbId)}" data-sec="${escapeHtml(secKey)}">
                Copy Link
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="hb-card">
        <div class="hb-title">${escapeHtml(hb.title || "Handbook")}</div>
        <div class="hb-meta">Program: <b>${escapeHtml(hb.program || "—")}</b></div>

        <div style="margin-top:10px;">
          ${secHtml || `<div class="small muted">No sections found in this handbook.</div>`}
        </div>
      </div>
    `;
  }

  function renderList(query = "") {
    const q = String(query || "").trim().toLowerCase();
    const filtered = handbooks.filter(hb => matches(hb, q));

    listEl.innerHTML = filtered.length
      ? filtered.map(buildAccordionHTML).join("")
      : `<div class="small muted">No matching handbooks / sections.</div>`;

    wireAccordionHandlers();
  }

  function wireAccordionHandlers() {
    // Toggle accordion
    qsa(".acc-header").forEach((btn) => {
      btn.onclick = () => {
        const item = btn.closest(".acc-item");
        const body = item?.querySelector(".acc-body");
        const plus = btn.querySelector("span.muted");
        const isOpen = body && body.style.display !== "none";

        // Close others inside same handbook card? (optional)
        // We'll allow multiple open.
        if (body) body.style.display = isOpen ? "none" : "block";
        if (plus) plus.textContent = isOpen ? "+" : "–";

        // Update hash when opening
        if (!isOpen && item) {
          const hbId = item.getAttribute("data-hb") || "";
          const secKey = item.getAttribute("data-sec") || "";
          setHash(hbId, secKey);
        }
      };
    });

    // Quick Ask
    qsa(".acc-quickask").forEach((btn) => {
      btn.onclick = async () => {
        const hbId = btn.getAttribute("data-hb") || "";
        const secKey = btn.getAttribute("data-sec") || "";
        const title = btn.getAttribute("data-title") || "this section";

        closeMenuPanel();
        showScreens(true);

        // Auto question template
        const campus = getCampus();
        const q = `Please summarize "${title}" for campus ${campus} and highlight key rules.`;
        userInput.value = q;
        await sendChat(q, { handbook_id: hbId, section_key: secKey });
      };
    });

    // Copy Link
    qsa(".acc-copylink").forEach((btn) => {
      btn.onclick = async () => {
        const hbId = btn.getAttribute("data-hb") || "";
        const secKey = btn.getAttribute("data-sec") || "";
        setHash(hbId, secKey);

        const url = window.location.href;
        try {
          await navigator.clipboard.writeText(url);
          btn.textContent = "Copied ✅";
          setTimeout(() => (btn.textContent = "Copy Link"), 1200);
        } catch {
          // Fallback
          prompt("Copy this link:", url);
        }
      };
    });
  }

  // Search
  searchEl?.addEventListener("input", () => renderList(searchEl.value));

  renderList("");

  // If hash has hb/sec -> open that section
  const { hb, sec } = parseHash();
  if (hb && sec) {
    // small delay so HTML exists
    setTimeout(() => {
      const target = qs(`.acc-item[data-hb="${CSS.escape(hb)}"][data-sec="${CSS.escape(sec)}"]`);
      const header = target?.querySelector(".acc-header");
      header?.click();
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }
}

async function openHandbookMenu() {
  const campus = getCampus();
  if (!campus) {
    openMenuPanel("Parent Handbook");
    menuPanelBody.innerHTML = `<div class="small" style="color:var(--danger);font-weight:800;">Select a campus first.</div>`;
    return;
  }

  openMenuPanel("Parent Handbook");
  menuPanelBody.innerHTML = `<div class="small muted">Loading handbooks…</div>`;

  try {
    HANDBOOK_CACHE = await loadHandbooksForCampus(campus);
    renderHandbookPanel(HANDBOOK_CACHE, campus);
  } catch (e) {
    menuPanelBody.innerHTML = `
      <div class="small" style="color:var(--danger);font-weight:900;">Error</div>
      <div class="small muted" style="margin-top:6px;">${escapeHtml(e?.message || "Failed to load handbooks")}</div>
    `;
  }
}

// -------------------------
// Policies / Protocols (list UI)
// -------------------------
async function openSimpleListMenu(kind) {
  const campus = getCampus();
  openMenuPanel(kind === "policies" ? "Policies" : "Protocols");
  menuPanelBody.innerHTML = `<div class="small muted">Loading…</div>`;

  const url = (kind === "policies" ? POLICIES_LIST_URL : PROTOCOLS_LIST_URL) + `?campus=${encodeURIComponent(campus || "")}`;

  try {
    const res = await authFetch(url, { method: "GET" });
    const data = await readJson(res);

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Unauthorized (staff token required)");
    }

    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.docs) ? data.docs : [];

    if (!items.length) {
      menuPanelBody.innerHTML = `<div class="small muted">No items found.</div>`;
      return;
    }

    menuPanelBody.innerHTML = `
      <div class="menu-group-label">Select an item</div>
      ${items.map((it, idx) => {
        const title = escapeHtml(it.title || it.name || `Item ${idx+1}`);
        const id = escapeHtml(it.id || it.doc_id || "");
        const link = escapeHtml(it.link || it.url || "");
        return `
          <button class="menu-item-btn" type="button" data-doc="${id}" data-link="${link}">
            ${title}
          </button>
        `;
      }).join("")}
      <div class="small muted" style="margin-top:10px;">Click an item to ask about it.</div>
    `;

    qsa(".menu-item-btn").forEach((btn) => {
      btn.onclick = () => {
        const title = btn.textContent.trim();
        closeMenuPanel();
        showScreens(true);
        const q = `Tell me the key points from "${title}" for campus ${getCampus()}.`;
        userInput.value = q;
        sendChat(q, { source_title: title, source_kind: kind });
      };
    });
  } catch (e) {
    menuPanelBody.innerHTML = `
      <div class="small" style="color:var(--danger);font-weight:900;">Error</div>
      <div class="small muted" style="margin-top:6px;">${escapeHtml(e?.message || "Failed")}</div>
      <div class="small muted" style="margin-top:10px;">
        If you are logged in as Parent, Policies/Protocols are hidden. If you still see this, refresh.
      </div>
    `;
  }
}

// -------------------------
// Chat send
// -------------------------
async function sendChat(question, meta = {}) {
  const q = String(question || "").trim();
  if (!q) return;

  // Require logged in token for staff/parent/admin
  const active = getActiveToken();
  if (!active.token) {
    showScreens(false);
    setLoginError("Please login first.");
    return;
  }

  addMsg("user", q);
  const typing = addTyping();

  const payload = {
    query: q,
    campus: getCampus(),
    role: getRole() || active.role || "staff",
    ...meta
  };

  try {
    const res = await authFetch(API_PROXY, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await readJson(res);

    typing?.remove?.();

    if (!res.ok || !data.ok) {
      // common worker error
      const msg = data.error || `Request failed (${res.status})`;
      addMsg("assistant", msg);

      // if token invalid, push back to login
      if (res.status === 401) {
        addMsg("assistant", "Session expired. Please login again.");
        clearSession();
        applyRoleUI();
        showScreens(false);
      }
      return;
    }

    addMsg("assistant", data.answer || data.text || "OK");
  } catch (e) {
    typing?.remove?.();
    addMsg("assistant", e?.message || "Network error");
  }
}

// -------------------------
// Events
// -------------------------
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoginError("");

  const code = accessCode?.value || "";
  const campus = campusSelect?.value || "";

  if (!campus) {
    setLoginError("Please select a campus.");
    return;
  }
  if (!code.trim()) {
    setLoginError("Please enter your access code.");
    return;
  }

  // Optional: show loading UI
  const btn = loginForm.querySelector('button[type="submit"]');
  const oldText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Logging in…"; }

  try {
    const out = await loginWithCode(code, campus);
    if (!out.ok) {
      setLoginError(out.error || "Login failed.");
      return;
    }

    // Success
    setLoginError("");
    accessCode.value = "";

    showScreens(true);
    applyRoleUI();

    // Default menu after login:
    if (getRole() === "parent" && !isTokenActive("admin")) {
      setActiveMenuPill("handbook");
      await openHandbookMenu();
    } else {
      setActiveMenuPill("policies");
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || "Login"; }
  }
});

chatForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput?.value || "";
  userInput.value = "";
  sendChat(q);
});

logoutBtn?.addEventListener("click", () => {
  clearSession();
  applyRoleUI();
  showScreens(false);
  setLoginError("");
  closeMenuPanel();
});

campusSwitch?.addEventListener("change", async () => {
  setCampus(campusSwitch.value);
  // If handbook menu is open, refresh it for new campus
  if (!menuPanel?.classList.contains("hidden") && CURRENT_MENU === "handbook") {
    await openHandbookMenu();
  }
});

adminModeBtn?.addEventListener("click", () => {
  openAdminModal();
});

adminPinCancel?.addEventListener("click", () => {
  closeAdminModal();
});

adminPinSubmit?.addEventListener("click", async () => {
  const pin = adminPinInput?.value || "";
  if (!pin.trim()) return;

  adminPinSubmit.disabled = true;
  const old = adminPinSubmit.textContent;
  adminPinSubmit.textContent = "Checking…";

  try {
    const out = await loginAdmin(pin);
    if (!out.ok) {
      alert(out.error || "Admin PIN invalid.");
      return;
    }
    closeAdminModal();
    applyRoleUI();
    alert("Admin mode enabled ✅");
  } finally {
    adminPinSubmit.disabled = false;
    adminPinSubmit.textContent = old || "Submit";
  }
});

loginAdminBtn?.addEventListener("click", () => {
  openAdminModal();
});

menuOverlay?.addEventListener("click", closeMenuPanel);
menuPanelClose?.addEventListener("click", closeMenuPanel);

// Menu pills click
qsa(".menu-pill").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const menu = btn.getAttribute("data-menu");
    if (!menu) return;

    // Role gating: Parent should only open handbook (unless admin token active)
    const parentOnly = getRole() === "parent" && !isTokenActive("admin");
    if (parentOnly && (menu === "policies" || menu === "protocols")) {
      // just ignore (and keep active on handbook)
      setActiveMenuPill("handbook");
      await openHandbookMenu();
      return;
    }

    CURRENT_MENU = menu;
    setActiveMenuPill(menu);

    if (menu === "handbook") {
      await openHandbookMenu();
    } else if (menu === "policies") {
      await openSimpleListMenu("policies");
    } else if (menu === "protocols") {
      await openSimpleListMenu("protocols");
    }
  });
});

// -------------------------
// Init
// -------------------------
(function init() {
  // Sync campus from storage
  const savedCampus = (localStorage.getItem(LS.campus) || "").toUpperCase();
  if (savedCampus) setCampus(savedCampus);

  // If any active token -> show app
  const active = getActiveToken();
  if (active.token) {
    // if user logged in previously as staff/parent but admin now active, keep role as stored
    showScreens(true);
  } else {
    showScreens(false);
  }

  applyRoleUI();

  // If deep link hash points to handbook section -> open handbook menu
  const { hb, sec } = parseHash();
  if (hb || sec) {
    // Only open if logged in
    if (active.token) {
      setActiveMenuPill("handbook");
      CURRENT_MENU = "handbook";
      openHandbookMenu();
    }
  }
})();