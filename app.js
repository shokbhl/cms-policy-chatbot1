// ============================
// CMS Policy Chatbot - app.js (FULL)
// + Parent Portal menus (Parent-only UI)
// - Staff/Parent login + Admin mode
// - Campus required on login (blank default)
// - Parent sees: Parent Handbook + Parent Portal (Announcements/ECA/Calendar/...)
// - Staff sees: Policies/Protocols/Handbook (NO Parent Portal pills by default)
// - Admin-only can browse Handbooks + Parent Portal (optional), and dashboard/logs
// ============================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const PARENT_AUTH_URL = `${WORKER_BASE}/auth/parent`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;
const HANDBOOKS_URL = `${WORKER_BASE}/handbooks`;
const PARENT_PORTAL_URL = `${WORKER_BASE}/parent-portal`;

const LS = {
  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",
  parentToken: "cms_parent_token",
  parentUntil: "cms_parent_until",
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until",
  campus: "cms_selected_campus"
};

// Parent Portal keys (must match Worker whitelist + KV keys)
const PARENT_PORTAL_KEYS = [
  "announcements",
  "eca",
  "calendar",
  "parent_interview",
  "tuition",
  "uniform",
  "daily_schedule",
  "age_info",
  "forms",
  "support"
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

const adminModeBtn = document.getElementById("admin-mode-btn");
const modeBadge = document.getElementById("mode-badge");
const adminModal = document.getElementById("admin-modal");
const adminPinInput = document.getElementById("admin-pin");
const adminPinSubmit = document.getElementById("admin-pin-submit");
const adminPinCancel = document.getElementById("admin-pin-cancel");

// optional
let adminLinks = document.getElementById("admin-links");
let topMenuBar = document.getElementById("top-menu-bar");
let menuPills = document.querySelectorAll(".menu-pill");

let typingBubble = null;

// handbook state
let handbookListCache = [];
let handbookOpenId = null;

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

// ============================
// SESSION / CAMPUS
// ============================
function normalizeCampus(code) {
  return String(code || "").trim().toUpperCase();
}

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

function isTokenActive(tokenKey, untilKey) {
  const token = localStorage.getItem(tokenKey);
  const until = Number(localStorage.getItem(untilKey) || "0");
  return !!token && Date.now() < until;
}

function isStaffActive() {
  return isTokenActive(LS.staffToken, LS.staffUntil);
}
function isParentActive() {
  return isTokenActive(LS.parentToken, LS.parentUntil);
}
function isAdminActive() {
  return isTokenActive(LS.adminToken, LS.adminUntil);
}

function clearStaffSession() {
  localStorage.removeItem(LS.staffToken);
  localStorage.removeItem(LS.staffUntil);
}
function clearParentSession() {
  localStorage.removeItem(LS.parentToken);
  localStorage.removeItem(LS.parentUntil);
}
function clearAdminSession() {
  localStorage.removeItem(LS.adminToken);
  localStorage.removeItem(LS.adminUntil);
}

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

// ============================
// MODE BADGE
// ============================
function setModeStaff() {
  if (modeBadge) {
    modeBadge.textContent = "STAFF";
    modeBadge.classList.remove("admin");
  }
  if (adminLinks) adminLinks.classList.add("hidden");
}
function setModeParent() {
  if (modeBadge) {
    modeBadge.textContent = "PARENT";
    modeBadge.classList.remove("admin");
  }
  if (adminLinks) adminLinks.classList.add("hidden");
}
function setModeAdmin() {
  if (modeBadge) {
    modeBadge.textContent = "ADMIN";
    modeBadge.classList.add("admin");
  }
  if (adminLinks) adminLinks.classList.remove("hidden");
}
function syncModeBadge() {
  if (isAdminActive()) setModeAdmin();
  else if (isStaffActive()) setModeStaff();
  else if (isParentActive()) setModeParent();
  else setModeStaff();
}

// ============================
// ROLE UI (show/hide menu pills)
// ============================
function applyRoleUI(role) {
  const isParent = role === "parent";
  const isStaff = role === "staff";
  const isAdminOnly = !role && isAdminActive();

  // These might exist in HTML
  const policiesBtn = document.querySelector('.menu-pill[data-menu="policies"]');
  const protocolsBtn = document.querySelector('.menu-pill[data-menu="protocols"]');
  const handbookBtn = document.querySelector('.menu-pill[data-menu="handbook"]');

  // Parent portal pills
  PARENT_PORTAL_KEYS.forEach((k) => {
    const b = document.querySelector(`.menu-pill[data-menu="${k}"]`);
    if (b) {
      // show for parent; also OK for admin-only (optional). hide for staff.
      b.style.display = (isParent || isAdminOnly) ? "" : "none";
    }
  });

  // Policies/Protocols only for staff/admin-only (not for parent)
  if (policiesBtn) policiesBtn.style.display = isParent ? "none" : "";
  if (protocolsBtn) protocolsBtn.style.display = isParent ? "none" : "";

  // Handbook for everyone (parent + staff + admin)
  if (handbookBtn) handbookBtn.style.display = "";

  // Update hint text in chat screen
  const hint = document.querySelector(".chat-top-hint");
  if (hint) {
    hint.textContent = isParent
      ? "View Parent Handbook and Parent Portal (campus-based). You can also ask questions about what you see."
      : "Ask any CMS policy, protocol, or parent handbook question (campus-based).";
  }

  // If parent and a staff-only panel is open, close it
  const activeType = document.querySelector(".menu-pill.active")?.dataset?.menu;
  if (isParent && (activeType === "policies" || activeType === "protocols")) closeMenuPanel();
}

// ============================
// TOP MENU EVENTS
// ============================
function ensureTopMenuBar() {
  topMenuBar = document.getElementById("top-menu-bar");
  menuPills = document.querySelectorAll(".menu-pill");
  adminLinks = document.getElementById("admin-links");

  menuPills.forEach((btn) => {
    btn.onclick = async () => {
      const type = btn.dataset.menu || "";
      if (!type) return;

      // toggle
      if (btn.classList.contains("active")) {
        closeMenuPanel();
        return;
      }

      await openMenuPanel(type);
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

  syncModeBadge();
  applyRoleUI(getActiveUserRole());
}

// ============================
// LOGIN (Staff or Parent)
// ============================
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setInlineError("");

  const code = (accessCodeInput?.value || "").trim();
  const selectedCampus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();

  if (!selectedCampus) {
    setInlineError("Please select a campus.");
    return;
  }
  if (!code) {
    setInlineError("Please enter Staff or Parent access code.");
    return;
  }

  const tryAuth = async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  try {
    let out = await tryAuth(STAFF_AUTH_URL);
    if (!out.res.ok || !out.data.ok) out = await tryAuth(PARENT_AUTH_URL);

    if (!out.res.ok || !out.data.ok) {
      setInlineError(out.data?.error || "Invalid code.");
      return;
    }

    const role = out.data.role; // "staff" or "parent"
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
    if (accessCodeInput) accessCodeInput.value = "";

    showChatUI();
    clearChat();

    syncModeBadge();
    applyRoleUI(role);

    const campus = escapeHtml(getCampus());
    const isParent = role === "parent";

    const welcome = isParent
      ? `Hi 👋 You’re signed in as <b>Parent</b>.<br>
         <b>Campus: ${campus}</b><br><br>
         You can view the <b>Parent Handbook</b> and the <b>Parent Portal</b> menus (Announcements, ECA, Calendar, Forms, Support, etc.).`
      : `Hi 👋 You’re signed in as <b>Staff</b>.<br>
         <b>Campus: ${campus}</b><br><br>
         Ask about any <b>policy</b>, <b>protocol</b>, or <b>parent handbook</b> for this campus.`;

    addMessage("assistant", welcome);
  } catch {
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

  // reset handbook cache
  handbookListCache = [];
  handbookOpenId = null;

  if (chatScreen && !chatScreen.classList.contains("hidden")) {
    addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);
  }

  // refresh open panel
  const active = document.querySelector(".menu-pill.active")?.dataset?.menu;
  if (active) await openMenuPanel(active);
});

// ============================
// ADMIN MODE
// ============================
async function enterAdminMode(pin) {
  const p = String(pin || "").trim();
  if (!p) return;

  try {
    const res = await fetch(ADMIN_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: p })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      addMessage("assistant", `Admin PIN error: ${escapeHtml(data.error || "Invalid PIN")}`);
      return;
    }

    localStorage.setItem(LS.adminToken, data.token);
    localStorage.setItem(LS.adminUntil, String(Date.now() + (data.expires_in || 28800) * 1000));

    syncModeBadge();
    addMessage("assistant", "✅ Admin mode enabled (8 hours).");
    applyRoleUI(getActiveUserRole());
  } catch {
    addMessage("assistant", "Admin login failed (network).");
  }
}

adminModeBtn?.addEventListener("click", () => {
  if (isAdminActive()) {
    clearAdminSession();
    syncModeBadge();
    addMessage("assistant", "Admin mode disabled.");
    applyRoleUI(getActiveUserRole());
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

// ============================
// MENU PANEL
// ============================
async function openMenuPanel(type) {
  if (!menuPanel || !menuPanelBody || !menuPanelTitle) return;

  const role = getActiveUserRole();
  const isParent = role === "parent";
  const isAdminOnly = !role && isAdminActive();

  // Parent hard guard
  if (isParent && (type === "policies" || type === "protocols")) {
    closeMenuPanel();
    addMessage("assistant", "Parents can only access Parent Handbook and Parent Portal.");
    return;
  }

  // activate pill
  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  // Parent Portal module?
  if (PARENT_PORTAL_KEYS.includes(type)) {
    menuPanelTitle.textContent = labelForParentPortal(type);
    menuPanelBody.innerHTML = "";
    await renderParentPortalModule(type);
    menuPanel.classList.remove("hidden");
    if (menuOverlay) menuOverlay.classList.remove("hidden");
    return;
  }

  // Handbook
  if (type === "handbook") {
    menuPanelTitle.textContent = "Parent Handbook";
    menuPanelBody.innerHTML = "";
    await renderHandbookBrowser();
    menuPanel.classList.remove("hidden");
    if (menuOverlay) menuOverlay.classList.remove("hidden");
    return;
  }

  // Policies/Protocols (staff/admin only)
  menuPanelTitle.textContent = type === "policies" ? "Policies" : "Protocols";
  menuPanelBody.innerHTML = "";

  const p = document.createElement("p");
  p.textContent = "Use chat to ask about this section.";
  p.className = "muted";
  menuPanelBody.appendChild(p);

  menuPanel.classList.remove("hidden");
  if (menuOverlay) menuOverlay.classList.remove("hidden");

  // If admin-only (no staff/parent), remind
  if (isAdminOnly) {
    const box = document.createElement("div");
    box.className = "muted";
    box.style.marginTop = "8px";
    box.innerHTML = `You’re in <b>Admin mode</b>. To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`;
    menuPanelBody.appendChild(box);
  }
}

function closeMenuPanel() {
  if (menuPanel) menuPanel.classList.add("hidden");
  if (menuOverlay) menuOverlay.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

// ============================
// PARENT PORTAL RENDER
// ============================
function labelForParentPortal(k) {
  const map = {
    announcements: "Announcements",
    eca: "ECA",
    calendar: "Calendar",
    parent_interview: "Parent Interview",
    tuition: "Tuition",
    uniform: "Uniform",
    daily_schedule: "Daily Schedule",
    age_info: "Age Info",
    forms: "Forms",
    support: "Support"
  };
  return map[k] || k;
}

async function fetchParentPortalValue(campus, key) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");

  const qs = `campus=${encodeURIComponent(campus)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(`${PARENT_PORTAL_URL}?${qs}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load");
  return data;
}

function renderJsonPretty(value) {
  // value could be string | object
  if (value == null) return `<div class="muted">No data.</div>`;

  if (typeof value === "string") {
    const txt = value.trim();
    if (!txt) return `<div class="muted">No information set yet.</div>`;
    // show as paragraph
    return `<div class="pp-text">${escapeHtml(txt)}</div>`;
  }

  // object
  // Special case: items[]
  if (Array.isArray(value.items)) {
    const items = value.items;
    if (!items.length) return `<div class="muted">No items yet.</div>`;

    const cards = items.map((it) => {
      const title = escapeHtml(it.title || "Item");
      const day = it.day ? `<span class="pp-tag">📅 ${escapeHtml(it.day)}</span>` : "";
      const time = it.time ? `<span class="pp-tag">⏰ ${escapeHtml(it.time)}</span>` : "";
      const grades = it.grades ? `<div class="pp-line"><b>Grades:</b> ${escapeHtml(it.grades)}</div>` : "";
      const notes = it.notes ? `<div class="pp-note">${escapeHtml(it.notes)}</div>` : "";

      return `
        <div class="pp-card">
          <div class="pp-title">${title}</div>
          <div class="pp-tags">${day}${time}</div>
          ${grades}
          ${notes}
        </div>
      `;
    }).join("");

    return `<div class="pp-cards">${cards}</div>`;
  }

  // fallback: show JSON but pretty
  return `<pre class="pp-pre">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

async function renderParentPortalModule(key) {
  const campus = getCampus();
  const token = getAnyBearerToken();

  const wrap = document.createElement("div");
  wrap.className = "pp-wrap";

  wrap.innerHTML = `
    <div class="pp-head">
      <div class="pp-head-title"><b>${escapeHtml(labelForParentPortal(key))}</b></div>
      <div class="pp-head-meta">Campus: <b>${escapeHtml(campus || "(not selected)")}</b></div>
    </div>
    <div class="muted">Loading…</div>
  `;

  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(wrap);

  if (!campus) {
    wrap.innerHTML = `<div class="muted">Please select a campus first.</div>`;
    return;
  }

  if (!token) {
    wrap.innerHTML = `<div class="muted">Not logged in.</div>`;
    return;
  }

  try {
    const data = await fetchParentPortalValue(campus, key);
    const source = data.source ? escapeHtml(data.source) : "—";
    const updated = data.updated_at ? new Date(data.updated_at).toLocaleString() : "—";

    wrap.innerHTML = `
      <div class="pp-head">
        <div class="pp-head-title"><b>${escapeHtml(labelForParentPortal(key))}</b></div>
        <div class="pp-head-meta">
          Campus: <b>${escapeHtml(campus)}</b> • Source: <b>${source}</b> • Updated: <b>${escapeHtml(updated)}</b>
        </div>
      </div>

      ${renderJsonPretty(data.value)}

      <div class="pp-actions">
        ${
          getActiveUserRole()
            ? `<button class="primary-btn" id="pp-ask-btn" type="button">Ask about this in chat</button>`
            : `<div class="muted">To ask questions in chat, login with a Staff or Parent code.</div>`
        }
      </div>
    `;

    document.getElementById("pp-ask-btn")?.addEventListener("click", () => {
      closeMenuPanel();
      const title = labelForParentPortal(key);
      askPolicy(`Using Parent Portal for campus ${campus}, module "${title}", please answer: `);
    });
  } catch (err) {
    wrap.innerHTML = `
      <div class="muted">${escapeHtml(err?.message || "Could not load module.")}</div>
    `;
  }
}

// ============================
// HANDBOOK BROWSER
// ============================
async function fetchHandbookListForCampus(campus) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");

  const res = await fetch(`${HANDBOOKS_URL}?campus=${encodeURIComponent(campus)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load handbooks");
  return data.handbooks || [];
}

async function fetchHandbookSection(campus, handbookId, sectionKey) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");

  const qs = `campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(handbookId)}&section=${encodeURIComponent(sectionKey)}`;
  const res = await fetch(`${HANDBOOKS_URL}?${qs}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json().catch(() => ({}));
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

  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(wrap);

  if (!campus) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Please select a campus first.";
    wrap.appendChild(p);
    return;
  }

  if (!token) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Not logged in.";
    wrap.appendChild(p);
    return;
  }

  const loading = document.createElement("div");
  loading.className = "muted";
  loading.textContent = "Loading handbooks...";
  wrap.appendChild(loading);

  try {
    if (!handbookListCache.length) handbookListCache = await fetchHandbookListForCampus(campus);
    loading.remove();

    if (!handbookListCache.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No handbooks found for this campus yet.";
      wrap.appendChild(p);
      return;
    }

    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = "Select a handbook to view sections:";
    wrap.appendChild(label);

    handbookListCache.forEach((hb) => {
      const hbBtn = document.createElement("button");
      hbBtn.className = "handbook-btn";
      hbBtn.innerHTML = `
        <div class="hb-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
        <div class="hb-sub">${escapeHtml(hb.program || "")}</div>
      `;

      const isOpen = handbookOpenId === hb.id;

      hbBtn.onclick = async () => {
        handbookOpenId = isOpen ? null : hb.id;
        await openMenuPanel("handbook");
      };

      wrap.appendChild(hbBtn);

      if (isOpen) {
        const secWrap = document.createElement("div");
        secWrap.className = "hb-sections";

        const secs = Array.isArray(hb.sections) ? hb.sections : [];
        if (!secs.length) {
          const p = document.createElement("div");
          p.className = "muted";
          p.textContent = "No sections in this handbook.";
          secWrap.appendChild(p);
        } else {
          secs.forEach((sec) => {
            const sBtn = document.createElement("button");
            sBtn.className = "hb-section-btn";
            sBtn.textContent = sec.title || sec.key || "Section";
            sBtn.onclick = async () => {
              await showHandbookSectionInPanel(campus, hb.id, sec.key, hb);
            };
            secWrap.appendChild(sBtn);
          });
        }

        wrap.appendChild(secWrap);
      }
    });
  } catch (err) {
    loading.remove();
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = err?.message || "Could not load handbooks.";
    wrap.appendChild(p);
  }
}

async function showHandbookSectionInPanel(campus, handbookId, sectionKey, hbMeta) {
  if (!menuPanelBody) return;

  menuPanelBody.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "handbook-wrap";
  wrap.innerHTML = `
    <div class="handbook-top">
      <div><b>${escapeHtml(hbMeta?.title || "Parent Handbook")}</b></div>
      <div class="handbook-meta">Campus: <b>${escapeHtml(campus)}</b></div>
    </div>
    <div class="muted" style="margin-top:6px;">Loading section...</div>
  `;
  menuPanelBody.appendChild(wrap);

  try {
    const data = await fetchHandbookSection(campus, handbookId, sectionKey);
    const section = data.section || {};
    const handbook = data.handbook || {};

    wrap.innerHTML = `
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
            <button class="mini-btn" id="hb-back" type="button">Back</button>
            ${
              handbook.link
                ? `<a class="mini-link" href="${escapeHtml(handbook.link)}" target="_blank" rel="noopener">Open full document</a>`
                : ""
            }
          </div>
        </div>

        <div class="hb-section-content">${escapeHtml(section.content || "No content yet.")}</div>

        <div class="hb-ask">
          ${
            getActiveUserRole()
              ? `<button class="primary-btn" id="hb-ask-btn" type="button">Ask this section in chat</button>`
              : `<div class="muted">To ask questions in chat, login with a Staff or Parent code.</div>`
          }
        </div>
      </div>
    `;

    document.getElementById("hb-back")?.addEventListener("click", async () => {
      await openMenuPanel("handbook");
    });

    document.getElementById("hb-ask-btn")?.addEventListener("click", () => {
      closeMenuPanel();
      const title = section.title || section.key || "this section";
      const hbTitle = handbook.title || hbMeta?.title || "Parent Handbook";
      askPolicy(`Using the Parent Handbook for campus ${campus}, handbook "${hbTitle}", section "${title}", please answer: `);
    });
  } catch (err) {
    wrap.innerHTML = `
      <div class="muted">${escapeHtml(err?.message || "Could not load section.")}</div>
      <button class="mini-btn" id="hb-back" type="button">Back</button>
    `;
    document.getElementById("hb-back")?.addEventListener("click", async () => {
      await openMenuPanel("handbook");
    });
  }
}

// ============================
// CHAT / API
// ============================
async function askPolicy(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;

  const campus = getCampus();
  if (!campus) {
    addMessage("assistant", "Please select a campus first.");
    return;
  }

  const role = getActiveUserRole();
  const token = getActiveBearerTokenForChat();

  if (!role || !token) {
    addMessage(
      "assistant",
      `You’re in <b>Admin mode</b> (dashboard/logs).<br>
       To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`
    );
    return;
  }

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ query: trimmed, campus })
    });

    hideTyping();

    if (res.status === 429) {
      addMessage("assistant", "Too many requests. Please wait a moment and try again.");
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      addMessage("assistant", escapeHtml(data.error || "Unauthorized. Please login again."));
      clearStaffSession();
      clearParentSession();
      showLoginUI();
      return;
    }

    if (!res.ok) {
      addMessage("assistant", escapeHtml(data.error || "Network error — please try again."));
      return;
    }

    const title = data.source?.title || "Answer:";
    const answer = data.answer || "";
    const linkPart = data.source?.link
      ? `<br><br><a href="${escapeHtml(data.source.link)}" target="_blank" rel="noopener">Open full document</a>`
      : "";

    const sec = data.handbook_section;
    const secPart =
      sec?.section_title || sec?.section_content
        ? `<br><br><div class="muted"><b>Handbook section:</b> ${escapeHtml(sec.section_title || sec.section_key || "")}</div>`
        : "";

    addMessage("assistant", `<b>${escapeHtml(title)}</b><br><br>${escapeHtml(answer)}${secPart}${linkPart}`);
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

  if (!isStaffActive()) clearStaffSession();
  if (!isParentActive()) clearParentSession();
  if (!isAdminActive()) clearAdminSession();

  if (!getCampus()) setCampus("");

  if (isStaffActive() || isParentActive()) {
    showChatUI();
    clearChat();
    syncModeBadge();

    const role = getActiveUserRole();
    applyRoleUI(role);

    const campus = escapeHtml(getCampus() || "(not selected)");
    const roleLabel = role === "parent" ? "Parent" : "Staff";

    const welcome = role === "parent"
      ? `Welcome back 👋<br>
         Signed in as <b>${roleLabel}</b><br>
         <b>Campus: ${campus}</b><br><br>
         You can view the <b>Parent Handbook</b> and the <b>Parent Portal</b> menus.`
      : `Welcome back 👋<br>
         Signed in as <b>${roleLabel}</b><br>
         <b>Campus: ${campus}</b><br><br>
         Ask any CMS <b>policy</b>, <b>protocol</b>, or <b>handbook</b> question.`;

    addMessage("assistant", welcome);
    return;
  }

  if (isAdminActive()) {
    showChatUI();
    clearChat();
    syncModeBadge();
    applyRoleUI(getActiveUserRole());

    addMessage(
      "assistant",
      `✅ Admin mode enabled.<br>
       <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>
       You can browse <b>Parent Handbook</b> and <b>Parent Portal</b> (if enabled).<br>
       To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`
    );
    return;
  }

  showLoginUI();
})();