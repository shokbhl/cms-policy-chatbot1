// ============================
// CMS Policy Chatbot - app.js (FULL FIXED)
// - Staff/Parent login + Admin-only mode
// - Campus required on login (blank default)
// - Program selector (All Programs / Preschool / Sr. Casa / Elementary)
// - Parent role can ONLY see Parent Handbook (UI + hard guard)
// - Staff role sees Policies/Protocols/Handbook
// - Admin-only can browse + Dashboard/Logs (but cannot chat without staff/parent)
// - Chat returns MULTI matches across categories
//
// ✅ NEW/FIXES:
// - Policies/Protocols browse like Parent Handbook (sections + subsections)
// - Robust content extraction (fallbacks) so "No content yet" doesn't happen incorrectly
// - Prevent UI freeze on "Policy not found" / bad response (try/catch + abort + safe state)
// - "Ask this section in chat" added to policy/protocol viewer too
// ============================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";

// chat + auth
const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const PARENT_AUTH_URL = `${WORKER_BASE}/auth/parent`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;

// handbook browse
const HANDBOOKS_URL = `${WORKER_BASE}/handbooks`;

// ✅ policies/protocols browse (if your Worker uses different routes, change here)
const POLICIES_URL = `${WORKER_BASE}/policies`;
const PROTOCOLS_URL = `${WORKER_BASE}/protocols`;

const LS = {
  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",
  parentToken: "cms_parent_token",
  parentUntil: "cms_parent_until",
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until",
  campus: "cms_selected_campus",
  program: "cms_selected_program"
};

const PROGRAMS = [
  { value: "ALL", label: "All Programs" },
  { value: "PRESCHOOL", label: "Preschool" },
  { value: "SR_CASA", label: "Sr. Casa" },
  { value: "ELEMENTARY", label: "Elementary" }
];

// ============================
// DOM
// ============================
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");

const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

const headerActions = document.getElementById("header-actions");
const logoutBtn = document.getElementById("logout-btn");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

const campusSelect = document.getElementById("campus-select");
const campusSwitch = document.getElementById("campus-switch");
const programSwitch = document.getElementById("program-switch");

const adminModeBtn = document.getElementById("admin-mode-btn");
const loginAdminBtn = document.getElementById("login-admin-btn");
const modeBadge = document.getElementById("mode-badge");
const adminModal = document.getElementById("admin-modal");
const adminPinInput = document.getElementById("admin-pin");
const adminPinSubmit = document.getElementById("admin-pin-submit");
const adminPinCancel = document.getElementById("admin-pin-cancel");

let adminLinks = document.getElementById("admin-links");
let topMenuBar = document.getElementById("top-menu-bar");
let menuPills = document.querySelectorAll(".menu-pill");

let typingBubble = null;

// ============================
// BROWSER STATE (Handbook + Policies + Protocols)
// ============================
let handbookListCache = [];
let handbookOpenId = null;

let policiesListCache = [];
let protocolsListCache = [];

let openDocType = "";     // "policies" | "protocols" | "handbook"
let openDocId = null;
let openPath = [];        // section path keys: ["A", "A.1", ...]

// Abort controllers to prevent freeze/race
const aborters = {
  menu: null,
  doc: null
};

// ============================
// UI HELPERS
// ============================
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toHtmlTextPreserveNewlines(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function addMessage(role, htmlText) {
  if (!chatWindow) return;
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = htmlText;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearChat() {
  if (chatWindow) chatWindow.innerHTML = "";
}

function showTyping() {
  hideTyping();
  if (!chatWindow) return;

  const wrapper = document.createElement("div");
  wrapper.className = "typing-bubble";

  const dots = document.createElement("div");
  dots.className = "typing-dots";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "typing-dot";
    dots.appendChild(dot);
  }

  wrapper.appendChild(dots);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  typingBubble = wrapper;
}

function hideTyping() {
  if (typingBubble && typingBubble.parentNode) typingBubble.parentNode.removeChild(typingBubble);
  typingBubble = null;
}

function setInlineError(text) {
  if (loginError) loginError.textContent = text || "";
}

function normalizeText(x) {
  if (x == null) return "";
  if (Array.isArray(x)) return x.map((v) => String(v ?? "")).join("\n");
  if (typeof x === "object") {
    // common object patterns
    if (typeof x.text === "string") return x.text;
    if (typeof x.content === "string") return x.content;
    if (Array.isArray(x.paragraphs)) return x.paragraphs.join("\n");
  }
  return String(x);
}

function normalizeCampus(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeProgram(value) {
  const v = String(value || "").trim().toUpperCase();
  if (!v) return "ALL";
  if (v === "ALL PROGRAMS") return "ALL";
  return v;
}

// Parent must ONLY see handbook menu
function applyRoleUI(role) {
  const isParent = role === "parent";
  const btnPolicies = document.querySelector('.menu-pill[data-menu="policies"]');
  const btnProtocols = document.querySelector('.menu-pill[data-menu="protocols"]');
  const btnHandbook = document.querySelector('.menu-pill[data-menu="handbook"]');

  if (btnPolicies) btnPolicies.style.display = isParent ? "none" : "";
  if (btnProtocols) btnProtocols.style.display = isParent ? "none" : "";
  if (btnHandbook) btnHandbook.style.display = "";

  if (isParent) {
    const activeType = document.querySelector(".menu-pill.active")?.dataset?.menu;
    if (activeType === "policies" || activeType === "protocols") closeMenuPanel();
  }
}

// ============================
// SESSION / CAMPUS / PROGRAM
// ============================
function setCampus(code) {
  const c = normalizeCampus(code);
  if (c) localStorage.setItem(LS.campus, c);
  else localStorage.removeItem(LS.campus);

  if (campusSelect) campusSelect.value = c || "";
  if (campusSwitch) campusSwitch.value = c || "";
}
function getCampus() {
  return normalizeCampus(localStorage.getItem(LS.campus) || "");
}

function setProgram(value) {
  const v = normalizeProgram(value);
  localStorage.setItem(LS.program, v);
  if (programSwitch) programSwitch.value = v;
}
function getProgram() {
  return normalizeProgram(localStorage.getItem(LS.program) || "ALL");
}
function programLabel(v) {
  const x = PROGRAMS.find((p) => p.value === v);
  return x ? x.label : "All Programs";
}

function isTokenActive(tokenKey, untilKey) {
  const token = localStorage.getItem(tokenKey);
  const until = Number(localStorage.getItem(untilKey) || "0");
  return !!token && Date.now() < until;
}
function isStaffActive() { return isTokenActive(LS.staffToken, LS.staffUntil); }
function isParentActive() { return isTokenActive(LS.parentToken, LS.parentUntil); }
function isAdminActive() { return isTokenActive(LS.adminToken, LS.adminUntil); }

function clearStaffSession() { localStorage.removeItem(LS.staffToken); localStorage.removeItem(LS.staffUntil); }
function clearParentSession() { localStorage.removeItem(LS.parentToken); localStorage.removeItem(LS.parentUntil); }
function clearAdminSession() { localStorage.removeItem(LS.adminToken); localStorage.removeItem(LS.adminUntil); }

function getActiveUserRole() {
  if (isStaffActive()) return "staff";
  if (isParentActive()) return "parent";
  return "";
}

function getActiveBearerTokenForChat() {
  if (isStaffActive()) return localStorage.getItem(LS.staffToken) || "";
  if (isParentActive()) return localStorage.getItem(LS.parentToken) || "";
  return "";
}

function getAnyBearerToken() {
  if (isStaffActive()) return localStorage.getItem(LS.staffToken) || "";
  if (isParentActive()) return localStorage.getItem(LS.parentToken) || "";
  if (isAdminActive()) return localStorage.getItem(LS.adminToken) || "";
  return "";
}

function setModeStaff() {
  if (modeBadge) { modeBadge.textContent = "STAFF"; modeBadge.classList.remove("admin"); }
  if (adminLinks) adminLinks.classList.add("hidden");
}
function setModeParent() {
  if (modeBadge) { modeBadge.textContent = "PARENT"; modeBadge.classList.remove("admin"); }
  if (adminLinks) adminLinks.classList.add("hidden");
}
function setModeAdmin() {
  if (modeBadge) { modeBadge.textContent = "ADMIN"; modeBadge.classList.add("admin"); }
  if (adminLinks) adminLinks.classList.remove("hidden");
}
function syncModeBadge() {
  if (isAdminActive()) setModeAdmin();
  else if (isStaffActive()) setModeStaff();
  else if (isParentActive()) setModeParent();
  else setModeStaff();
}

// ============================
// TOP MENU
// ============================
function ensureTopMenuBar() {
  topMenuBar = document.getElementById("top-menu-bar");

  if (!topMenuBar) {
    const nav = document.createElement("nav");
    nav.id = "top-menu-bar";
    nav.className = "top-menu-bar hidden";
    nav.innerHTML = `
      <div class="top-menu-inner">
        <button class="menu-pill" data-menu="policies">Policies</button>
        <button class="menu-pill" data-menu="protocols">Protocols</button>
        <button class="menu-pill" data-menu="handbook">Parent Handbook</button>

        <div id="admin-links" class="admin-links hidden">
          <a class="admin-link" href="dashboard.html">Dashboard</a>
          <a class="admin-link" href="logs.html">Logs</a>
        </div>
      </div>
    `;
    const header = document.querySelector("header");
    if (header && header.parentNode) header.parentNode.insertBefore(nav, header.nextSibling);
    else document.body.insertBefore(nav, document.body.firstChild);

    topMenuBar = nav;
  }

  menuPills = document.querySelectorAll(".menu-pill");
  adminLinks = document.getElementById("admin-links");

  menuPills.forEach((btn) => {
    btn.onclick = async () => {
      const type = btn.dataset.menu;
      if (btn.classList.contains("active")) closeMenuPanel();
      else await openMenuPanel(type);
    };
  });

  if (menuPanelClose) menuPanelClose.onclick = closeMenuPanel;
  if (menuOverlay) menuOverlay.onclick = closeMenuPanel;
}

function forceShowTopMenu() {
  if (!topMenuBar) return;
  topMenuBar.classList.remove("hidden");
  topMenuBar.style.display = "block";
  topMenuBar.style.visibility = "visible";
  topMenuBar.style.opacity = "1";
}

// ============================
// SCREEN TOGGLES
// ============================
function showLoginUI() {
  closeMenuPanel();

  if (chatScreen) chatScreen.classList.add("hidden");
  if (loginScreen) loginScreen.classList.remove("hidden");

  if (headerActions) headerActions.classList.add("hidden");
  if (topMenuBar) topMenuBar.classList.add("hidden");

  syncModeBadge();
}

function showChatUI() {
  if (loginScreen) loginScreen.classList.add("hidden");
  if (chatScreen) chatScreen.classList.remove("hidden");

  ensureTopMenuBar();

  if (headerActions) headerActions.classList.remove("hidden");
  forceShowTopMenu();

  if (programSwitch) programSwitch.value = getProgram();

  syncModeBadge();
  applyRoleUI(getActiveUserRole());
  renderStatusLine();
}

function renderStatusLine() {
  const el = document.getElementById("status-line");
  if (!el) return;

  const campus = escapeHtml(getCampus() || "(not selected)");
  const prog = escapeHtml(programLabel(getProgram()));
  el.innerHTML = `Campus: <b>${campus}</b> • Program: <b>${prog}</b>`;
}

// ============================
// NETWORK HELPERS
// ============================
function abortOld(kind) {
  try { aborters[kind]?.abort?.(); } catch {}
  aborters[kind] = null;
}

async function getJSON(url, headers = {}, kind = "menu") {
  abortOld(kind);
  const ac = new AbortController();
  aborters[kind] = ac;

  const res = await fetch(url, { method: "GET", headers, signal: ac.signal });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function postJSON(url, body, headers = {}, kind = "doc") {
  abortOld(kind);
  const ac = new AbortController();
  aborters[kind] = ac;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body || {}),
    signal: ac.signal
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// ============================
// LOGIN
// ============================
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setInlineError("");

  const code = (accessCodeInput?.value || "").trim();
  const selectedCampus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();

  if (!selectedCampus) { setInlineError("Please select a campus."); return; }
  if (!code) { setInlineError("Please enter Staff or Parent access code."); return; }

  const tryAuth = async (url) => {
    const { res, data } = await postJSON(url, { code }, {}, "doc");
    return { res, data };
  };

  try {
    let out = await tryAuth(STAFF_AUTH_URL);
    if (!out.res.ok || !out.data.ok) out = await tryAuth(PARENT_AUTH_URL);

    if (!out.res.ok || !out.data.ok) {
      setInlineError(out.data?.error || "Invalid code.");
      return;
    }

    const role = out.data.role;
    const token = out.data.token;
    const expiresIn = out.data.expires_in || 28800;

    clearStaffSession();
    clearParentSession();

    if (role === "staff") {
      localStorage.setItem(LS.staffToken, token);
      localStorage.setItem(LS.staffUntil, String(Date.now() + expiresIn * 1000));
    } else {
      localStorage.setItem(LS.parentToken, token);
      localStorage.setItem(LS.parentUntil, String(Date.now() + expiresIn * 1000));
    }

    setCampus(selectedCampus);
    if (!localStorage.getItem(LS.program)) setProgram("ALL");

    if (accessCodeInput) accessCodeInput.value = "";

    // reset caches on new login
    handbookListCache = [];
    policiesListCache = [];
    protocolsListCache = [];
    openDocType = "";
    openDocId = null;
    openPath = [];

    showChatUI();
    clearChat();

    const campus = escapeHtml(getCampus());
    const prog = escapeHtml(programLabel(getProgram()));
    const isParent = role === "parent";

    const welcome = isParent
      ? `Hi 👋 You’re signed in as <b>Parent</b>.<br><b>Campus: ${campus}</b> • <b>Program: ${prog}</b><br><br>You can view the <b>Parent Handbook</b>.`
      : `Hi 👋 You’re signed in as <b>Staff</b>.<br><b>Campus: ${campus}</b> • <b>Program: ${prog}</b><br><br>Ask about any <b>policy</b>, <b>protocol</b>, or <b>parent handbook</b>.`;

    addMessage("assistant", welcome);
  } catch (err) {
    setInlineError("Could not connect to server.");
  }
});

// ============================
// LOGOUT
// ============================
logoutBtn?.addEventListener("click", () => {
  closeMenuPanel();
  clearChat();

  clearStaffSession();
  clearParentSession();
  clearAdminSession();

  if (accessCodeInput) accessCodeInput.value = "";
  setInlineError("");

  setCampus("");
  showLoginUI();
});

// ============================
// CAMPUS CHANGE
// ============================
campusSelect?.addEventListener("change", () => {
  setCampus(normalizeCampus(campusSelect.value));
});

campusSwitch?.addEventListener("change", async () => {
  const c = normalizeCampus(campusSwitch.value);
  if (!c) return;

  setCampus(c);

  // reset campus-specific caches
  handbookListCache = [];
  openDocType = "";
  openDocId = null;
  openPath = [];

  renderStatusLine();

  if (chatScreen && !chatScreen.classList.contains("hidden")) {
    addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);
  }

  const activeHandbookBtn = document.querySelector('.menu-pill[data-menu="handbook"]');
  const activePoliciesBtn = document.querySelector('.menu-pill[data-menu="policies"]');
  const activeProtocolsBtn = document.querySelector('.menu-pill[data-menu="protocols"]');

  if (activeHandbookBtn?.classList.contains("active")) await openMenuPanel("handbook");
  if (activePoliciesBtn?.classList.contains("active")) await openMenuPanel("policies");
  if (activeProtocolsBtn?.classList.contains("active")) await openMenuPanel("protocols");
});

// ============================
// PROGRAM CHANGE
// ============================
programSwitch?.addEventListener("change", () => {
  setProgram(programSwitch.value);
  renderStatusLine();
  addMessage("assistant", `✅ Program set to <b>${escapeHtml(programLabel(getProgram()))}</b>.`);
});

// ============================
// ADMIN MODE
// ============================
async function enterAdminMode(pin) {
  const p = String(pin || "").trim();
  if (!p) return;

  try {
    const { res, data } = await postJSON(ADMIN_AUTH_URL, { pin: p }, {}, "doc");
    if (!res.ok || !data.ok) {
      addMessage("assistant", `Admin PIN error: ${escapeHtml(data.error || "Invalid PIN")}`);
      return;
    }

    localStorage.setItem(LS.adminToken, data.token);
    localStorage.setItem(LS.adminUntil, String(Date.now() + (data.expires_in || 28800) * 1000));

    syncModeBadge();
    addMessage("assistant", "✅ Admin mode enabled (8 hours).");
  } catch {
    addMessage("assistant", "Admin login failed (network).");
  }
}

adminModeBtn?.addEventListener("click", () => {
  if (isAdminActive()) {
    clearAdminSession();
    syncModeBadge();
    addMessage("assistant", "Admin mode disabled.");
    return;
  }

  if (adminModal && adminPinInput && adminPinSubmit && adminPinCancel) {
    adminPinInput.value = "";
    adminModal.classList.remove("hidden");
    adminPinInput.focus();

    adminPinCancel.onclick = () => adminModal.classList.add("hidden");
    adminPinSubmit.onclick = async () => {
      const pin = adminPinInput.value.trim();
      adminModal.classList.add("hidden");
      await enterAdminMode(pin);
    };
    return;
  }

  const pin = prompt("Enter Admin PIN:");
  if (pin) enterAdminMode(pin);
});

loginAdminBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (isAdminActive()) {
    clearAdminSession();
    syncModeBadge();
    setInlineError("Admin mode disabled.");
    return;
  }

  const pin = prompt("Enter Admin PIN:");
  if (pin) enterAdminMode(pin);
});

// ============================
// MENU PANEL
// ============================
async function openMenuPanel(type) {
  if (!menuPanel || !menuPanelBody || !menuPanelTitle) return;

  // Parent hard guard
  const role = getActiveUserRole();
  if (role === "parent" && (type === "policies" || type === "protocols")) {
    closeMenuPanel();
    addMessage("assistant", "Parents can only access the Parent Handbook.");
    return;
  }

  // activate pill
  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbook";

  menuPanelBody.innerHTML = "";

  // show overlay/panel
  menuPanel.classList.remove("hidden");
  if (menuOverlay) menuOverlay.classList.remove("hidden");

  try {
    if (type === "handbook") {
      openDocType = "handbook";
      await renderHandbookBrowser();
      return;
    }

    if (type === "policies") {
      openDocType = "policies";
      await renderPoliciesBrowser();
      return;
    }

    if (type === "protocols") {
      openDocType = "protocols";
      await renderProtocolsBrowser();
      return;
    }
  } catch (err) {
    // never freeze UI
    menuPanelBody.innerHTML = `<p class="muted">${escapeHtml(err?.message || "Something went wrong.")}</p>`;
  }
}

function closeMenuPanel() {
  abortOld("menu");
  abortOld("doc");
  if (menuPanel) menuPanel.classList.add("hidden");
  if (menuOverlay) menuOverlay.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

// ============================
// HANDBOOK BROWSER
// ============================
async function fetchHandbookListForCampus(campus) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");

  const { res, data } = await getJSON(
    `${HANDBOOKS_URL}?campus=${encodeURIComponent(campus)}`,
    { Authorization: `Bearer ${token}` },
    "menu"
  );

  if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load handbooks");
  return data.handbooks || [];
}

async function fetchHandbookSection(campus, handbookId, sectionKey) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");

  const qs = `campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(handbookId)}&section=${encodeURIComponent(sectionKey)}`;
  const { res, data } = await getJSON(
    `${HANDBOOKS_URL}?${qs}`,
    { Authorization: `Bearer ${token}` },
    "doc"
  );

  if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load section");
  return data;
}

async function renderHandbookBrowser() {
  const campus = getCampus();
  const token = getAnyBearerToken();

  const wrap = document.createElement("div");
  wrap.className = "handbook-wrap";

  wrap.innerHTML = `
    <div class="handbook-top">
      <div><b>Parent Handbook (Campus-based)</b></div>
      <div class="handbook-meta">Current campus: <b>${escapeHtml(campus || "(not selected)")}</b></div>
    </div>
  `;

  if (!campus) {
    wrap.innerHTML += `<p class="muted">Please select a campus first.</p>`;
    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(wrap);
    return;
  }

  if (!token) {
    wrap.innerHTML += `<p class="muted">Not logged in.</p>`;
    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(wrap);
    return;
  }

  wrap.innerHTML += `<div class="muted">Loading handbooks...</div>`;
  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(wrap);

  try {
    if (!handbookListCache.length) handbookListCache = await fetchHandbookListForCampus(campus);

    wrap.innerHTML = `
      <div class="handbook-top">
        <div><b>Parent Handbook (Campus-based)</b></div>
        <div class="handbook-meta">Current campus: <b>${escapeHtml(campus)}</b></div>
      </div>
    `;

    if (!handbookListCache.length) {
      wrap.innerHTML += `<p class="muted">No handbooks found for this campus yet.</p>`;
      return;
    }

    wrap.innerHTML += `<div class="menu-group-label">Select a handbook to view sections:</div>`;

    handbookListCache.forEach((hb) => {
      const hbId = hb?.id;
      const hbBtn = document.createElement("button");
      hbBtn.className = "handbook-btn";
      hbBtn.innerHTML = `
        <div class="hb-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
        <div class="hb-sub">${escapeHtml(hb.program || "")}</div>
      `;

      const isOpen = handbookOpenId === hbId;

      hbBtn.onclick = async () => {
        handbookOpenId = isOpen ? null : hbId;
        await renderHandbookBrowser();
      };

      wrap.appendChild(hbBtn);

      if (isOpen) {
        const secWrap = document.createElement("div");
        secWrap.className = "hb-sections";

        const secs = Array.isArray(hb.sections) ? hb.sections : [];
        if (!secs.length) {
          secWrap.innerHTML = `<div class="muted">No sections in this handbook.</div>`;
        } else {
          secs.forEach((sec) => {
            const sBtn = document.createElement("button");
            sBtn.className = "hb-section-btn";
            sBtn.textContent = sec.title || sec.key || "Section";
            sBtn.onclick = async () => {
              await showHandbookSectionInPanel(campus, hbId, sec.key, hb);
            };
            secWrap.appendChild(sBtn);
          });
        }

        wrap.appendChild(secWrap);
      }
    });
  } catch (err) {
    wrap.innerHTML += `<p class="muted">${escapeHtml(err?.message || "Could not load handbooks.")}</p>`;
  }
}

async function showHandbookSectionInPanel(campus, handbookId, sectionKey, hbMeta) {
  if (!menuPanelBody) return;

  menuPanelBody.innerHTML = `
    <div class="handbook-wrap">
      <div class="handbook-top">
        <div><b>${escapeHtml(hbMeta?.title || "Parent Handbook")}</b></div>
        <div class="handbook-meta">Campus: <b>${escapeHtml(campus)}</b></div>
      </div>
      <div class="muted" style="margin-top:6px;">Loading section...</div>
    </div>
  `;

  try {
    const data = await fetchHandbookSection(campus, handbookId, sectionKey);
    const section = data.section || {};
    const handbook = data.handbook || {};

    const contentHtml = toHtmlTextPreserveNewlines(normalizeText(section.content) || "No content yet.");

    menuPanelBody.innerHTML = `
      <div class="handbook-wrap">
        <div class="handbook-top">
          <div><b>${escapeHtml(handbook.title || hbMeta?.title || "Parent Handbook")}</b></div>
          <div class="handbook-meta">
            Campus: <b>${escapeHtml(campus)}</b>
            ${handbook.program ? ` • Program: <b>${escapeHtml(handbook.program)}</b>` : ""}
          </div>
        </div>

        <div class="hb-section-view">
          <div class="hb-section-head">
            <div class="hb-section-title">${escapeHtml(section.title || section.key || "Section")}</div>
            <div class="hb-section-actions">
              <button class="mini-btn" id="hb-back">Back</button>
              ${handbook.link ? `<a class="mini-link" href="${escapeHtml(handbook.link)}" target="_blank" rel="noopener">Open full document</a>` : ""}
            </div>
          </div>

          <div class="hb-section-content">${contentHtml}</div>

          <div class="hb-ask">
            ${
              getActiveUserRole()
                ? `<button class="primary-btn" id="hb-ask-btn">Ask this section in chat</button>`
                : `<div class="muted">To ask questions in chat, login with a Staff or Parent code.</div>`
            }
          </div>
        </div>
      </div>
    `;

    document.getElementById("hb-back")?.addEventListener("click", async () => renderHandbookBrowser());

    document.getElementById("hb-ask-btn")?.addEventListener("click", () => {
      closeMenuPanel();
      const title = section.title || section.key || "this section";
      const hbTitle = handbook.title || hbMeta?.title || "Parent Handbook";
      askPolicy(`Using Parent Handbook (${hbTitle}) section "${title}", please answer: `);
    });
  } catch (err) {
    menuPanelBody.innerHTML = `
      <div class="handbook-wrap">
        <div class="muted">${escapeHtml(err?.message || "Could not load section.")}</div>
        <button class="mini-btn" id="hb-back">Back</button>
      </div>
    `;
    document.getElementById("hb-back")?.addEventListener("click", async () => renderHandbookBrowser());
  }
}

// ============================
// POLICIES / PROTOCOLS BROWSER (LIKE HANDBOOK)
// ============================

function pickListFromResponse(data) {
  // supports many shapes:
  // {policies:[...]} {protocols:[...]} {docs:[...]} {items:[...]} {list:[...]}
  const candidates = [
    data?.policies,
    data?.protocols,
    data?.docs,
    data?.items,
    data?.list
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function normalizeSectionNode(node) {
  if (!node || typeof node !== "object") return null;

  const key = String(node.key || node.id || node.slug || "").trim() || null;
  const title = String(node.title || node.name || node.label || key || "Section");
  const content = normalizeText(
    node.content ?? node.text ?? node.body ?? node.value ?? node.paragraphs ?? ""
  );

  const childrenRaw =
    node.children ??
    node.subsections ??
    node.sub_sections ??
    node.subSections ??
    node.sections ??
    [];

  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeSectionNode).filter(Boolean)
    : [];

  return { key, title, content, children };
}

function extractDocTextFallback(doc) {
  // robust fallback for doc-level content
  const direct =
    doc?.content ??
    doc?.text ??
    doc?.body ??
    doc?.value ??
    doc?.overview ??
    doc?.description ??
    doc?.paragraphs ??
    "";

  const t = normalizeText(direct);
  if (t && t.trim()) return t;

  // sometimes doc.sections have content but overview is empty:
  const secsRaw = Array.isArray(doc?.sections) ? doc.sections : [];
  const firstWithContent = secsRaw.find((s) => normalizeText(s?.content ?? s?.text ?? "").trim());
  if (firstWithContent) return normalizeText(firstWithContent.content ?? firstWithContent.text);

  return "";
}

function getDocSections(doc) {
  const raw = doc?.sections ?? doc?.toc ?? doc?.outline ?? [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(normalizeSectionNode).filter(Boolean);
}

function findSectionByPath(sections, pathKeys) {
  let currentList = sections;
  let currentNode = null;

  for (const k of pathKeys) {
    if (!Array.isArray(currentList)) return null;
    currentNode = currentList.find((n) => String(n.key || "") === String(k));
    if (!currentNode) return null;
    currentList = currentNode.children || [];
  }
  return currentNode;
}

function renderDocListPanel(title, list, onOpenDoc) {
  const wrap = document.createElement("div");
  wrap.className = "handbook-wrap";

  wrap.innerHTML = `
    <div class="handbook-top">
      <div><b>${escapeHtml(title)}</b></div>
      <div class="handbook-meta">Campus: <b>${escapeHtml(getCampus() || "(not selected)")}</b></div>
    </div>
    <div class="menu-group-label">Select a document to view sections:</div>
  `;

  if (!list.length) {
    wrap.innerHTML += `<p class="muted">No documents found.</p>`;
    return wrap;
  }

  list.forEach((d) => {
    const btn = document.createElement("button");
    btn.className = "handbook-btn";
    const secs = getDocSections(d);
    const count = secs.length ? `${secs.length} sections` : "No sections";
    btn.innerHTML = `
      <div class="hb-title">${escapeHtml(d.title || d.name || "Document")}</div>
      <div class="hb-sub">${escapeHtml(count)}</div>
    `;
    btn.onclick = () => onOpenDoc(d);
    wrap.appendChild(btn);
  });

  return wrap;
}

function renderSectionPills(sections, onPick) {
  const container = document.createElement("div");
  container.className = "hb-sections";
  if (!sections.length) {
    container.innerHTML = `<div class="muted">No sections.</div>`;
    return container;
  }

  sections.forEach((sec) => {
    const b = document.createElement("button");
    b.className = "hb-section-btn";
    b.textContent = sec.title || sec.key || "Section";
    b.onclick = () => onPick(sec);
    container.appendChild(b);
  });

  return container;
}

function renderDocViewer(docTypeLabel, doc, sections, pathKeys) {
  // determine current node from path
  const node = pathKeys.length ? findSectionByPath(sections, pathKeys) : null;

  const docTitle = doc?.title || doc?.name || "Document";
  const docLink = doc?.link || doc?.url || null;

  // content selection:
  // - if node exists: use node.content (fallback to doc text)
  // - else: use doc-level text fallback
  const rawContent = node ? (node.content || "") : extractDocTextFallback(doc);
  const contentText = rawContent && rawContent.trim() ? rawContent : "No content yet.";
  const contentHtml = toHtmlTextPreserveNewlines(contentText);

  // next-level sections:
  // - if node has children => show subsections
  // - else if no path selected => show top sections
  const nextSections = node ? (node.children || []) : sections;

  const wrap = document.createElement("div");
  wrap.className = "handbook-wrap";

  const breadcrumb =
    node
      ? `${escapeHtml(docTypeLabel)} • ${escapeHtml(pathKeys.map((k) => {
          const n = findSectionByPath(sections, pathKeys.slice(0, pathKeys.indexOf(k) + 1));
          return n?.title || k;
        }).join(" / "))}`
      : `${escapeHtml(docTypeLabel)} • Overview`;

  wrap.innerHTML = `
    <div class="handbook-top">
      <div><b>${escapeHtml(docTitle)}</b></div>
      <div class="handbook-meta">${breadcrumb}</div>
    </div>

    <div class="hb-section-view">
      <div class="hb-section-head">
        <div class="hb-section-title">${escapeHtml(node?.title || "Overview")}</div>
        <div class="hb-section-actions">
          <button class="mini-btn" id="doc-back">${pathKeys.length ? "Back" : "Back to list"}</button>
          ${docLink ? `<a class="mini-link" href="${escapeHtml(docLink)}" target="_blank" rel="noopener">Open full document</a>` : ""}
        </div>
      </div>

      ${
        nextSections.length
          ? `<div class="menu-group-label">Select a section:</div>`
          : ""
      }

      <div id="doc-sections-slot"></div>

      <div class="hb-section-content" style="margin-top:10px;">${contentHtml}</div>

      <div class="hb-ask">
        ${
          getActiveUserRole()
            ? `<button class="primary-btn" id="doc-ask-btn">Ask this section in chat</button>`
            : `<div class="muted">To ask questions in chat, login with a Staff or Parent code.</div>`
        }
      </div>
    </div>
  `;

  // attach section pills
  const slot = wrap.querySelector("#doc-sections-slot");
  if (slot && nextSections.length) {
    slot.appendChild(renderSectionPills(nextSections, (sec) => {
      // extend path
      const newPath = node ? [...pathKeys, sec.key] : [sec.key];
      openPath = newPath;
      // re-render viewer
      safeRenderOpenDoc();
    }));
  }

  // back button
  wrap.querySelector("#doc-back")?.addEventListener("click", () => {
    if (pathKeys.length) {
      openPath = pathKeys.slice(0, -1);
      safeRenderOpenDoc();
    } else {
      // back to list for the type
      openDocId = null;
      openPath = [];
      safeRenderOpenDoc();
    }
  });

  // ask button
  wrap.querySelector("#doc-ask-btn")?.addEventListener("click", () => {
    closeMenuPanel();
    const secTitle = node?.title || "Overview";
    const prefix = `Using ${docTypeLabel} (${docTitle}) section "${secTitle}", please answer: `;
    askPolicy(prefix);
  });

  return wrap;
}

async function fetchDocList(type) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");
  const campus = getCampus();
  if (!campus) throw new Error("Please select a campus first.");

  const base = type === "policies" ? POLICIES_URL : PROTOCOLS_URL;
  // common pattern: /policies?campus=MC (even if campus not needed, it won't hurt)
  const url = `${base}?campus=${encodeURIComponent(campus)}`;

  const { res, data } = await getJSON(url, { Authorization: `Bearer ${token}` }, "menu");
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `${type} list failed`);

  const list = pickListFromResponse(data);

  // normalize minimal fields
  return list.map((d) => ({
    ...d,
    id: d?.id || d?.doc_id || d?.docId || d?.key || null,
    title: d?.title || d?.name || d?.label || "Document",
    link: d?.link || d?.url || null
  })).filter((d) => d.id);
}

async function fetchDocDetail(type, docId) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");
  const campus = getCampus();
  if (!campus) throw new Error("Please select a campus first.");

  const base = type === "policies" ? POLICIES_URL : PROTOCOLS_URL;

  // common patterns:
  // /policies?campus=MC&id=XYZ
  // /policies?id=XYZ
  const url = `${base}?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(docId)}`;

  const { res, data } = await getJSON(url, { Authorization: `Bearer ${token}` }, "doc");
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `${type} doc failed`);

  // accept shapes: {policy:{...}} {protocol:{...}} {doc:{...}} {item:{...}} or direct doc
  const doc =
    data?.policy ||
    data?.protocol ||
    data?.doc ||
    data?.item ||
    data;

  return doc;
}

async function renderPoliciesBrowser() {
  const campus = getCampus();
  const token = getAnyBearerToken();
  if (!menuPanelBody) return;

  if (!campus) {
    menuPanelBody.innerHTML = `<p class="muted">Please select a campus first.</p>`;
    return;
  }
  if (!token) {
    menuPanelBody.innerHTML = `<p class="muted">Not logged in.</p>`;
    return;
  }

  // if a doc is open -> render it
  if (openDocId && openDocType === "policies") {
    await safeRenderOpenDoc();
    return;
  }

  menuPanelBody.innerHTML = `<p class="muted">Loading policies...</p>`;

  try {
    if (!policiesListCache.length) policiesListCache = await fetchDocList("policies");
    const listEl = renderDocListPanel("Policies", policiesListCache, (doc) => {
      openDocType = "policies";
      openDocId = doc.id;
      openPath = [];
      safeRenderOpenDoc();
    });
    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(listEl);
  } catch (err) {
    menuPanelBody.innerHTML = `<p class="muted">${escapeHtml(err?.message || "Could not load policies.")}</p>`;
  }
}

async function renderProtocolsBrowser() {
  const campus = getCampus();
  const token = getAnyBearerToken();
  if (!menuPanelBody) return;

  if (!campus) {
    menuPanelBody.innerHTML = `<p class="muted">Please select a campus first.</p>`;
    return;
  }
  if (!token) {
    menuPanelBody.innerHTML = `<p class="muted">Not logged in.</p>`;
    return;
  }

  if (openDocId && openDocType === "protocols") {
    await safeRenderOpenDoc();
    return;
  }

  menuPanelBody.innerHTML = `<p class="muted">Loading protocols...</p>`;

  try {
    if (!protocolsListCache.length) protocolsListCache = await fetchDocList("protocols");
    const listEl = renderDocListPanel("Protocols", protocolsListCache, (doc) => {
      openDocType = "protocols";
      openDocId = doc.id;
      openPath = [];
      safeRenderOpenDoc();
    });
    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(listEl);
  } catch (err) {
    menuPanelBody.innerHTML = `<p class="muted">${escapeHtml(err?.message || "Could not load protocols.")}</p>`;
  }
}

async function safeRenderOpenDoc() {
  if (!menuPanelBody || !openDocType || !openDocId) return;

  const docType = openDocType;
  const label = docType === "policies" ? "Policies" : "Protocols";

  // render loading
  menuPanelBody.innerHTML = `<p class="muted">Loading document...</p>`;

  try {
    const doc = await fetchDocDetail(docType, openDocId);
    const sections = getDocSections(doc);

    // If doc has no sections but has some content, it's ok -> overview shows text.
    // If doc has sections but titles show and content missing -> our extract fallback will try harder.

    const viewer = renderDocViewer(label, doc, sections, openPath);
    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(viewer);
  } catch (err) {
    // IMPORTANT: do not break other docs; stay usable
    const msg = err?.message || "Document not found";
    menuPanelBody.innerHTML = `
      <div class="handbook-wrap">
        <div class="muted">${escapeHtml(msg)}</div>
        <button class="mini-btn" id="doc-back-list">Back to list</button>
      </div>
    `;
    document.getElementById("doc-back-list")?.addEventListener("click", async () => {
      openDocId = null;
      openPath = [];
      if (openDocType === "policies") await renderPoliciesBrowser();
      else await renderProtocolsBrowser();
    });
  }
}

// ============================
// CHAT / API (MULTI RESULTS)
// ============================
function badgeForType(t) {
  const x = String(t || "").toLowerCase();
  if (x === "policy") return "Policy";
  if (x === "protocol") return "Protocol";
  if (x === "handbook") return "Handbook";
  return "Result";
}

function renderMatches(matches, note) {
  const wrap = document.createElement("div");
  wrap.className = "multi-wrap";

  if (note) {
    wrap.innerHTML += `<div class="muted" style="margin-bottom:8px;">${escapeHtml(note)}</div>`;
  }

  (matches || []).forEach((m) => {
    const type = badgeForType(m.type);
    const title = m.title || "Answer";
    const program = m.program ? ` • <span class="muted">Program:</span> <b>${escapeHtml(m.program)}</b>` : "";
    const link = m.link ? `<div style="margin-top:10px;"><a href="${escapeHtml(m.link)}" target="_blank" rel="noopener">Open full document</a></div>` : "";
    const why = m.why ? `<div class="muted" style="margin-top:8px;"><b>Why:</b> ${escapeHtml(m.why)}</div>` : "";

    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="result-head">
        <span class="result-badge">${escapeHtml(type)}</span>
        <div class="result-title">${escapeHtml(title)}</div>
      </div>
      <div class="result-meta">
        <span class="muted">Campus:</span> <b>${escapeHtml(getCampus())}</b>${program}
      </div>
      <div class="result-body">${toHtmlTextPreserveNewlines(normalizeText(m.answer || ""))}</div>
      ${why}
      ${link}
    `;
    wrap.appendChild(card);
  });

  addMessage("assistant", wrap.outerHTML);
}

async function askPolicy(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;

  const campus = getCampus();
  if (!campus) { addMessage("assistant", "Please select a campus first."); return; }

  const role = getActiveUserRole();
  const token = getActiveBearerTokenForChat();
  if (!role || !token) {
    addMessage("assistant", `You’re in <b>Admin mode</b> (dashboard/logs).<br>To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`);
    return;
  }

  const program = getProgram();

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const { res, data } = await postJSON(
      API_URL,
      { query: trimmed, campus, program },
      { Authorization: `Bearer ${token}` },
      "doc"
    );

    hideTyping();

    if (res.status === 429) { addMessage("assistant", "Too many requests. Please wait a moment and try again."); return; }

    if (res.status === 401) {
      addMessage("assistant", escapeHtml(data.error || "Unauthorized. Please login again."));
      clearStaffSession(); clearParentSession();
      showLoginUI();
      return;
    }

    if (!res.ok || !data.ok) {
      addMessage("assistant", escapeHtml(data.error || "Network error — please try again."));
      return;
    }

    const matches = Array.isArray(data.matches) ? data.matches : [];
    if (!matches.length) {
      addMessage("assistant", "No results returned.");
      return;
    }

    renderMatches(matches, data.note || "");
  } catch {
    hideTyping();
    addMessage("assistant", "Error connecting to server.");
  }
}

chatForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = (userInput?.value || "").trim();
  if (!q) return;
  userInput.value = "";
  askPolicy(q);
});

// ============================
// INIT
// ============================
(function init() {
  ensureTopMenuBar();

  if (loginAdminBtn) loginAdminBtn.setAttribute("type", "button");

  if (!isStaffActive()) clearStaffSession();
  if (!isParentActive()) clearParentSession();
  if (!isAdminActive()) clearAdminSession();

  if (!getCampus()) setCampus("");

  if (!localStorage.getItem(LS.program)) setProgram("ALL");
  if (programSwitch) {
    if (!programSwitch.options.length) {
      programSwitch.innerHTML = PROGRAMS.map((p) => `<option value="${p.value}">${p.label}</option>`).join("");
    }
    programSwitch.value = getProgram();
  }

  if (isStaffActive() || isParentActive()) {
    showChatUI();
    clearChat();

    const role = getActiveUserRole();
    applyRoleUI(role);

    const campus = escapeHtml(getCampus() || "(not selected)");
    const prog = escapeHtml(programLabel(getProgram()));
    const roleLabel = role === "parent" ? "Parent" : "Staff";

    const welcome = role === "parent"
      ? `Welcome back 👋<br>Signed in as <b>${roleLabel}</b><br><b>Campus: ${campus}</b> • <b>Program: ${prog}</b><br><br>You can view the <b>Parent Handbook</b>.`
      : `Welcome back 👋<br>Signed in as <b>${roleLabel}</b><br><b>Campus: ${campus}</b> • <b>Program: ${prog}</b><br><br>Ask any CMS <b>policy</b>, <b>protocol</b>, or <b>handbook</b> question.`;

    addMessage("assistant", welcome);
    return;
  }

  if (isAdminActive()) {
    showChatUI();
    clearChat();
    syncModeBadge();
    applyRoleUI(getActiveUserRole());
    addMessage("assistant", `✅ Admin mode enabled.<br><b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>You can browse <b>Policies</b>, <b>Protocols</b>, and <b>Parent Handbook</b>, and access <b>Dashboard/Logs</b>.<br>To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`);
    return;
  }

  showLoginUI();
})();
