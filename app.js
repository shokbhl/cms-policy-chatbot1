// ============================
// app.js (FULL)
// Works with your index.html IDs + style.css
// Endpoints expected on same origin:
//   POST  /api
//   POST  /auth/admin
//   GET   /handbooks?campus=YC
// ============================

// ---------- CONFIG ----------
const ENDPOINTS = {
  api: "/api",
  adminAuth: "/auth/admin",
  handbooks: "/handbooks"
};

const LS = {
  // Staff/Parent login token (for /api + /handbooks)
  userToken: "cms_user_token",
  userUntil: "cms_user_until",
  userRole: "cms_user_role",     // "staff" | "parent"
  campus: "cms_campus",

  // Admin session (for dashboard/logs + admin endpoints)
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

const SESSION_HOURS = 8; // fallback for UI expiry if expires_in not provided
const DEFAULT_EXP_MS = SESSION_HOURS * 60 * 60 * 1000;

// ---------- DOM ----------
const el = (id) => document.getElementById(id);

// Screens
const loginScreen = el("login-screen");
const chatScreen = el("chat-screen");

// Header / menu
const headerActions = el("header-actions");
const topMenuBar = el("top-menu-bar");
const campusSwitch = el("campus-switch");
const modeBadge = el("mode-badge");
const adminLinks = el("admin-links");

// Login form
const loginForm = el("login-form");
const accessCodeInput = el("access-code");
const campusSelect = el("campus-select");
const loginError = el("login-error");
const loginAdminBtn = el("login-admin-btn");
const logoutBtn = el("logout-btn");
const adminModeBtn = el("admin-mode-btn");

// Admin modal
const adminModal = el("admin-modal");
const adminPinInput = el("admin-pin");
const adminPinCancel = el("admin-pin-cancel");
const adminPinSubmit = el("admin-pin-submit");

// Chat
const chatWindow = el("chat-window");
const chatForm = el("chat-form");
const userInput = el("user-input");

// Menu panel (modal)
const menuOverlay = el("menu-overlay");
const menuPanel = el("menu-panel");
const menuPanelTitle = el("menu-panel-title");
const menuPanelBody = el("menu-panel-body");
const menuPanelClose = el("menu-panel-close");

// Menu pills
const menuButtons = Array.from(document.querySelectorAll(".menu-pill"));

// ---------- UTIL ----------
function now() {
  return Date.now();
}

function setText(node, text) {
  if (!node) return;
  node.textContent = text ?? "";
}

function show(node) {
  if (!node) return;
  node.classList.remove("hidden");
}

function hide(node) {
  if (!node) return;
  node.classList.add("hidden");
}

function setError(msg) {
  setText(loginError, msg || "");
}

function isSessionActive(tokenKey, untilKey) {
  const token = localStorage.getItem(tokenKey) || "";
  const until = Number(localStorage.getItem(untilKey) || "0");
  return !!token && now() < until;
}

function getUserToken() {
  return localStorage.getItem(LS.userToken) || "";
}

function getUserRole() {
  return (localStorage.getItem(LS.userRole) || "").trim().toLowerCase();
}

function getCampus() {
  return (localStorage.getItem(LS.campus) || "").trim().toUpperCase();
}

function isAdminActive() {
  return isSessionActive(LS.adminToken, LS.adminUntil);
}

function saveSession({ tokenKey, untilKey, token, expiresInSec }) {
  const expMs = expiresInSec ? (Number(expiresInSec) * 1000) : DEFAULT_EXP_MS;
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(untilKey, String(now() + expMs));
}

function clearUserSession() {
  localStorage.removeItem(LS.userToken);
  localStorage.removeItem(LS.userUntil);
  localStorage.removeItem(LS.userRole);
  // keep campus? up to you - I keep it so user doesn't reselect every time
}

function clearAdminSession() {
  localStorage.removeItem(LS.adminToken);
  localStorage.removeItem(LS.adminUntil);
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- UI STATE ----------
function setModeBadge() {
  const role = getUserRole() || "staff";
  const admin = isAdminActive();

  if (!modeBadge) return;
  if (admin) {
    modeBadge.textContent = "ADMIN";
    modeBadge.classList.add("admin");
  } else {
    modeBadge.textContent = role.toUpperCase();
    modeBadge.classList.remove("admin");
  }
}

function setCampusUI(campus) {
  const c = String(campus || "").trim().toUpperCase();
  if (campusSwitch) campusSwitch.value = c || "";
  if (campusSelect) campusSelect.value = c || "";
  localStorage.setItem(LS.campus, c || "");
}

function showAppShell() {
  show(headerActions);
  show(topMenuBar);
  show(chatScreen);
  hide(loginScreen);

  // admin links visible only if admin session exists
  if (adminLinks) {
    if (isAdminActive()) show(adminLinks);
    else hide(adminLinks);
  }

  setModeBadge();
}

function showLogin() {
  hide(headerActions);
  hide(topMenuBar);
  hide(chatScreen);
  show(loginScreen);

  if (adminLinks) hide(adminLinks);
  setModeBadge();
}

// ---------- CHAT RENDER ----------
function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = esc(text);
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addMsgHtml(role, html) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = html;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addTyping() {
  const wrap = document.createElement("div");
  wrap.className = "typing-bubble";
  wrap.id = "typing-bubble";
  wrap.innerHTML = `
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTyping() {
  const t = el("typing-bubble");
  if (t) t.remove();
}

// ---------- API CALLS ----------
async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// ---------- LOGIN (Staff/Parent by code) ----------
async function loginWithAccessCode(code, campus) {
  // We don't know if code is staff or parent.
  // We try staff first, then parent.
  // If one succeeds we store role + token.

  const c = String(code || "").trim();
  const cp = String(campus || "").trim().toUpperCase();
  if (!c) return { ok: false, error: "Please enter access code." };
  if (!cp) return { ok: false, error: "Please select campus." };

  // Try staff
  let { res, data } = await postJson("/auth/staff", { code: c });
  if (res.ok && data?.ok && data?.token) {
    saveSession({ tokenKey: LS.userToken, untilKey: LS.userUntil, token: data.token, expiresInSec: data.expires_in });
    localStorage.setItem(LS.userRole, "staff");
    setCampusUI(cp);
    return { ok: true, role: "staff" };
  }

  // Try parent
  ({ res, data } = await postJson("/auth/parent", { code: c }));
  if (res.ok && data?.ok && data?.token) {
    saveSession({ tokenKey: LS.userToken, untilKey: LS.userUntil, token: data.token, expiresInSec: data.expires_in });
    localStorage.setItem(LS.userRole, "parent");
    setCampusUI(cp);
    return { ok: true, role: "parent" };
  }

  // Both failed -> show best error
  const msg =
    data?.error ||
    (res.status === 401 ? "Invalid access code." : `Login failed (${res.status}).`);
  return { ok: false, error: msg };
}

// ---------- ADMIN LOGIN ----------
function openAdminModal() {
  if (!adminModal) return;
  show(adminModal);
  adminPinInput && (adminPinInput.value = "");
  adminPinInput && adminPinInput.focus();
}

function closeAdminModal() {
  if (!adminModal) return;
  hide(adminModal);
}

async function loginAdminWithPin(pin) {
  const p = String(pin || "").trim();
  if (!p) return { ok: false, error: "Missing PIN." };

  const { res, data } = await postJson(ENDPOINTS.adminAuth, { pin: p });
  if (!res.ok || !data?.ok || !data?.token) {
    return { ok: false, error: data?.error || `Admin login failed (${res.status}).` };
  }

  saveSession({ tokenKey: LS.adminToken, untilKey: LS.adminUntil, token: data.token, expiresInSec: data.expires_in });
  return { ok: true };
}

// ---------- MENU PANEL ----------
function openMenu(title) {
  setText(menuPanelTitle, title || "Menu");
  show(menuOverlay);
  show(menuPanel);
  menuPanel?.setAttribute("aria-hidden", "false");
}

function closeMenu() {
  hide(menuOverlay);
  hide(menuPanel);
  menuPanel?.setAttribute("aria-hidden", "true");
  if (menuButtons?.length) menuButtons.forEach(b => b.classList.remove("active"));
}

menuOverlay?.addEventListener("click", closeMenu);
menuPanelClose?.addEventListener("click", closeMenu);

// ---------- HANDBOOK UI (browse) ----------
async function loadHandbooksList() {
  const campus = getCampus();
  const token = getUserToken();
  if (!campus) {
    menuPanelBody.innerHTML = `<div class="muted">Select a campus first.</div>`;
    return;
  }
  if (!token || !isSessionActive(LS.userToken, LS.userUntil)) {
    menuPanelBody.innerHTML = `<div class="muted">Please login first.</div>`;
    return;
  }

  menuPanelBody.innerHTML = `<div class="muted">Loading handbooks…</div>`;

  const { res, data } = await getJson(`${ENDPOINTS.handbooks}?campus=${encodeURIComponent(campus)}`, authHeaders(token));
  if (!res.ok || !data?.ok) {
    menuPanelBody.innerHTML = `<div class="muted">Failed: ${esc(data?.error || res.status)}</div>`;
    return;
  }

  const list = Array.isArray(data.handbooks) ? data.handbooks : [];
  if (!list.length) {
    menuPanelBody.innerHTML = `<div class="muted">No handbooks found for ${esc(campus)} yet.</div>`;
    return;
  }

  const html = list.map(hb => {
    const sections = Array.isArray(hb.sections) ? hb.sections : [];
    const secBtns = sections.map(s => `
      <button class="hb-section-btn" data-hb="${esc(hb.id)}" data-sec="${esc(s.key)}" type="button">
        ${esc(s.title || s.key)}
      </button>
    `).join("");

    return `
      <div class="hb-card">
        <div class="hb-title">${esc(hb.title || "Parent Handbook")}</div>
        <div class="hb-meta">
          Campus: <b>${esc(hb.campus || campus)}</b>
          ${hb.program ? ` • Program: <b>${esc(hb.program)}</b>` : ""}
        </div>
        <div class="hb-open-row">
          ${hb.link ? `<a class="hb-open-btn" href="${esc(hb.link)}" target="_blank" rel="noopener">Open PDF/Link</a>` : ""}
        </div>
        ${secBtns ? `<div style="margin-top:10px">${secBtns}</div>` : `<div class="muted small" style="margin-top:8px">No sections.</div>`}
      </div>
    `;
  }).join("");

  menuPanelBody.innerHTML = html;

  // attach section click handlers
  menuPanelBody.querySelectorAll(".hb-section-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const hbId = btn.getAttribute("data-hb");
      const sec = btn.getAttribute("data-sec");
      await showHandbookSection(hbId, sec);
    });
  });
}

async function showHandbookSection(handbookId, sectionKey) {
  const campus = getCampus();
  const token = getUserToken();
  if (!campus || !token) return;

  menuPanelBody.innerHTML = `<div class="muted">Loading section…</div>`;
  const url =
    `${ENDPOINTS.handbooks}?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(handbookId)}&section=${encodeURIComponent(sectionKey)}`;

  const { res, data } = await getJson(url, authHeaders(token));
  if (!res.ok || !data?.ok) {
    menuPanelBody.innerHTML = `<div class="muted">Failed: ${esc(data?.error || res.status)}</div>`;
    return;
  }

  const title = data?.section?.title || sectionKey;
  const content = data?.section?.content || "";
  menuPanelBody.innerHTML = `
    <div class="hb-card">
      <div class="hb-title">${esc(title)}</div>
      <div class="hb-meta">Campus: <b>${esc(campus)}</b></div>
      <pre style="white-space:pre-wrap; margin:10px 0 0; font: 13px system-ui; line-height:1.45; color:#111827;">${esc(content)}</pre>
      <div class="hb-open-row">
        <button class="hb-open-btn" id="hbBackBtn" type="button">← Back</button>
      </div>
    </div>
  `;

  const backBtn = el("hbBackBtn");
  backBtn?.addEventListener("click", loadHandbooksList);
}

// ---------- POLICIES / PROTOCOLS (simple UI placeholders) ----------
function menuPlaceholder(title, bodyHtml) {
  menuPanelBody.innerHTML = `
    <div class="hb-card">
      <div class="hb-title">${esc(title)}</div>
      <div class="hb-meta">Tip: If you want, I can connect these to your policy/protocol list endpoint too.</div>
      <div style="margin-top:10px">${bodyHtml}</div>
    </div>
  `;
}

// If you already have endpoints to browse policies/protocols, tell me their paths and I’ll wire them.
async function openPoliciesMenu() {
  menuPlaceholder("Policies", `<div class="muted">Policies menu UI is ready. (Add browse endpoint if you want list here.)</div>`);
}
async function openProtocolsMenu() {
  menuPlaceholder("Protocols", `<div class="muted">Protocols menu UI is ready. (Add browse endpoint if you want list here.)</div>`);
}

// ---------- ASK CHAT ----------
async function askQuestion(question) {
  const q = String(question || "").trim();
  if (!q) return;

  const campus = getCampus() || (campusSwitch?.value || "").trim().toUpperCase();
  if (!campus) {
    addMsg("assistant", "Please select a campus first.");
    return;
  }

  if (!isSessionActive(LS.userToken, LS.userUntil)) {
    addMsg("assistant", "Session expired. Please login again.");
    showLogin();
    return;
  }

  const token = getUserToken();
  addMsg("user", q);
  addTyping();

  try {
    const { res, data } = await postJson(
      ENDPOINTS.api,
      { query: q, campus },
      authHeaders(token)
    );

    removeTyping();

    if (!res.ok) {
      const msg = data?.error || `Request failed (${res.status}).`;
      addMsg("assistant", msg);
      return;
    }

    const answer = data?.answer || "";
    const role = data?.user_role || getUserRole() || "";
    const source = data?.source;
    const hb = data?.handbook_section;

    let extra = "";
    if (source?.title || source?.type) {
      extra += `<div class="small muted" style="margin-top:8px">
        <b>Source</b>: ${esc(source.type || "doc")} • ${esc(source.title || source.id || "")}
      </div>`;
    }

    if (hb?.section_title || hb?.section_key) {
      extra += `<div class="small muted" style="margin-top:6px">
        <b>Handbook section</b>: ${esc(hb.section_title || hb.section_key || "")}
      </div>`;
      if (hb?.section_content) {
        extra += `<div class="small" style="margin-top:6px; white-space:pre-wrap;">${esc(hb.section_content)}</div>`;
      }
    }

    addMsgHtml("assistant", `<div>${esc(answer)}</div>${extra}`);
  } catch (e) {
    removeTyping();
    addMsg("assistant", e?.message || "Network error");
  }
}

// ---------- EVENTS ----------

// Login submit (staff/parent)
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("");

  const code = accessCodeInput?.value || "";
  const campus = campusSelect?.value || "";

  // show quick UI feedback
  const btn = loginForm.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;

  const result = await loginWithAccessCode(code, campus);

  if (btn) btn.disabled = false;

  if (!result.ok) {
    setError(result.error || "Login failed");
    return;
  }

  // Clear sensitive input
  if (accessCodeInput) accessCodeInput.value = "";

  // Enter app
  showAppShell();
  addMsg("assistant", `Logged in as ${result.role.toUpperCase()} for campus ${getCampus()}. Ask your question anytime.`);
});

// Campus switch (top right)
campusSwitch?.addEventListener("change", () => {
  const c = campusSwitch.value || "";
  setCampusUI(c);
});

// Admin login button on login screen
loginAdminBtn?.addEventListener("click", () => {
  openAdminModal();
});

// Admin mode button in header (lets you enable admin for dashboard/logs)
adminModeBtn?.addEventListener("click", () => {
  openAdminModal();
});

// Admin modal buttons
adminPinCancel?.addEventListener("click", closeAdminModal);
adminPinSubmit?.addEventListener("click", async () => {
  const pin = adminPinInput?.value || "";
  adminPinSubmit.disabled = true;

  const result = await loginAdminWithPin(pin);
  adminPinSubmit.disabled = false;

  if (!result.ok) {
    alert(result.error || "Admin login failed");
    return;
  }

  closeAdminModal();
  setModeBadge();

  // show admin links now
  if (adminLinks) show(adminLinks);

  alert("Admin mode enabled (8h). You can open Dashboard / Logs.");
});

// Logout
logoutBtn?.addEventListener("click", () => {
  clearUserSession();
  // admin session optional: keep or clear. I keep it unless you want full logout:
  // clearAdminSession();

  // reset UI
  if (chatWindow) chatWindow.innerHTML = "";
  setError("");
  showLogin();
});

// Menu pills
menuButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    // active state
    menuButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const menu = btn.getAttribute("data-menu") || "";
    if (menu === "handbook") {
      openMenu("Parent Handbook");
      await loadHandbooksList();
      return;
    }
    if (menu === "policies") {
      openMenu("Policies");
      await openPoliciesMenu();
      return;
    }
    if (menu === "protocols") {
      openMenu("Protocols");
      await openProtocolsMenu();
      return;
    }
  });
});

// Chat form submit
chatForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = userInput?.value || "";
  if (userInput) userInput.value = "";
  await askQuestion(q);
});

// Enter key in admin pin input
adminPinInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") adminPinSubmit?.click();
});

// ---------- INIT ----------
(function init() {
  // restore campus
  const savedCampus = getCampus();
  if (savedCampus) setCampusUI(savedCampus);

  // if user session active -> go to app
  if (isSessionActive(LS.userToken, LS.userUntil)) {
    showAppShell();
    addMsg("assistant", `Welcome back. Campus ${getCampus() || "—"}. Ask your question anytime.`);
  } else {
    showLogin();
  }

  // Admin links state
  if (adminLinks) {
    if (isAdminActive()) show(adminLinks);
    else hide(adminLinks);
  }

  setModeBadge();
})();
