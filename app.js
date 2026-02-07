// ============================
// CMS Policy Chatbot - app.js (FULL)
// - Staff/Parent login + Admin-only mode
// - Campus + Program selection (Program optional; defaults to All Programs)
// - Parent role can ONLY see Parent Handbook
// - Staff role sees Policies/Protocols/Handbook
// - Multi-results rendering: show ALL matching sources (policy/protocol/handbook, multiple programs)
// ============================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const PARENT_AUTH_URL = `${WORKER_BASE}/auth/parent`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;
const HANDBOOKS_URL = `${WORKER_BASE}/handbooks`;

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

// NOTE: “ask in chat” quick prompts (not documents).
const MENU_ITEMS = {
  policies: [
    { id: "safe_arrival", label: "Safe Arrival & Dismissal" },
    { id: "playground_safety", label: "Playground Safety" },
    { id: "anaphylaxis_policy", label: "Anaphylaxis Policy" },
    { id: "medication_administration", label: "Medication Administration" },
    { id: "emergency_management", label: "Emergency Management" },
    { id: "sleep_toddlers", label: "Sleep – Toddler & Preschool" },
    { id: "sleep_infants", label: "Sleep – Infants" },
    { id: "students_volunteers", label: "Supervision of Students & Volunteers" },
    { id: "waiting_list", label: "Waiting List" },
    { id: "program_statement", label: "Program Statement Implementation" },
    { id: "staff_development", label: "Staff Development & Training" },
    { id: "parent_issues_concerns", label: "Parent Issues & Concerns" },
    { id: "behaviour_management_monitoring", label: "Behaviour Management Monitoring" },
    { id: "fire_safety", label: "Fire Safety Evacuation" },
    { id: "criminal_reference_vsc_policy", label: "Criminal Reference / VSC" }
  ],
  protocols: [
    { id: "program_statement1", label: "CMS Program Statement and Implementation" },
    { id: "non_discrimination", label: "CMS Policies & Procedures and Non-Discrimination / Anti-Racism Policy" },
    { id: "safety_security", label: "Safety & Security" },
    { id: "start_school_year", label: "Start of the New School Year" },
    { id: "employee_conduct", label: "Employee Protocol / Conduct" },
    { id: "classroom_management", label: "Classroom Management & Routines" },
    { id: "caring_students", label: "Caring for Our Students" },
    { id: "afterschool_routines", label: "Afterschool Routines & Extracurricular Activities" },
    { id: "special_events", label: "Special Events" },
    { id: "reports_forms", label: "Reports & Forms" },
    { id: "other", label: "Other" },
    { id: "closing", label: "In Closing" }
  ],
  handbook: []
};

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

const campusSelect = document.getElementById("campus-select"); // login select
const campusSwitch = document.getElementById("campus-switch"); // header select
const programSwitch = document.getElementById("program-switch"); // header select

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

// typing bubble ref
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

function badgeHtml(label, sub) {
  const s = sub ? ` <span class="badge-sub">${escapeHtml(sub)}</span>` : "";
  return `<span class="badge">${escapeHtml(label)}${s}</span>`;
}

function renderResultsBlock(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const suggestion = String(payload?.suggestion || "").trim();

  if (!results.length) {
    const tip = suggestion
      ? `<div class="result-tip">${escapeHtml(suggestion)}</div>`
      : `<div class="result-tip">No specific match found. Try adding a keyword or selecting a Program.</div>`;
    addMessage("assistant", `<div class="result-group">
      <div class="result-title">Answer</div>
      ${tip}
    </div>`);
    return;
  }

  let html = `<div class="result-group">`;

  if (suggestion) {
    html += `<div class="result-tip">💡 ${escapeHtml(suggestion)}</div>`;
  }

  results.forEach((r) => {
    const label = r.label || (r.type === "protocol" ? "Protocols" : r.type === "policy" ? "Policies" : "Parent Handbook");
    const prog = r.program ? ` • ${r.program}` : "";
    const title = r.title ? escapeHtml(r.title) : "Source";

    const sec = r.handbook_section?.section_title || r.handbook_section?.section_key;
    const secLine = sec ? `<div class="result-meta">Section: <b>${escapeHtml(sec)}</b></div>` : "";

    const link = r.link
      ? `<div class="result-link"><a href="${escapeHtml(r.link)}" target="_blank" rel="noopener">Open full document</a></div>`
      : "";

    const why = r.why ? `<div class="result-why">${escapeHtml(r.why)}</div>` : "";

    html += `
      <div class="result-card">
        <div class="result-head">
          <div class="result-badges">
            ${badgeHtml(label, r.type || "")}
            ${r.program ? badgeHtml("Program", r.program) : ""}
          </div>
          <div class="result-doc-title">${title}${escapeHtml(prog)}</div>
        </div>
        <div class="result-body">${escapeHtml(r.answer || "")}</div>
        ${secLine}
        ${why}
        ${link}
      </div>
    `;
  });

  html += `</div>`;
  addMessage("assistant", html);
}

// Parent must ONLY see handbook menu
function applyRoleUI(role) {
  const isParent = role === "parent";

  const btnPolicies = document.querySelector('.menu-pill[data-menu="policies"]');
  const btnProtocols = document.querySelector('.menu-pill[data-menu="protocols"]');
  const btnHandbook = document.querySelector('.menu-pill[data-menu="handbook"]');

  if (btnPolicies) btnPolicies.style.display = isParent ? "none" : "";
  if (btnProtocols) btnProtocols.style.display = isParent ? "none" : "";
  if (btnHandbook) btnHandbook.style.display = ""; // always show

  if (isParent) {
    const activeType = document.querySelector(".menu-pill.active")?.dataset?.menu;
    if (activeType === "policies" || activeType === "protocols") closeMenuPanel();
  }
}

// ============================
// SESSION / CAMPUS / PROGRAM
// ============================
function normalizeCampus(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeProgram(code) {
  const s = String(code || "").trim().toUpperCase();
  if (!s) return "ALL";
  if (s === "ALL" || s.includes("ALL")) return "ALL";
  if (s === "PRESCHOOL") return "PRESCHOOL";
  if (s === "SR_CASA") return "SR_CASA";
  if (s === "ELEMENTARY") return "ELEMENTARY";
  return "ALL";
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

function setProgram(code) {
  const p = normalizeProgram(code);
  localStorage.setItem(LS.program, p);
  if (programSwitch) programSwitch.value = p;
}

function getProgram() {
  return normalizeProgram(localStorage.getItem(LS.program) || "ALL");
}

function programLabel(p) {
  const found = PROGRAMS.find((x) => x.value === normalizeProgram(p));
  return found ? found.label : "All Programs";
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

  // ensure program dropdown reflects LS
  if (programSwitch) programSwitch.value = getProgram();

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

  if (/admin/i.test(code)) {
    setInlineError('This looks like an Admin PIN. Please use "Admin Login" instead.');
    return;
  }

  const selectedCampus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();
  if (!selectedCampus) { setInlineError("Please select a campus."); return; }
  if (!code) { setInlineError("Please enter Staff or Parent access code."); return; }

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

    showChatUI();
    clearChat();

    syncModeBadge();
    applyRoleUI(role);

    const campus = escapeHtml(getCampus());
    const prog = escapeHtml(programLabel(getProgram()));
    const isParent = role === "parent";

    const welcome = isParent
      ? `Hi 👋 You’re signed in as <b>Parent</b>.<br>
         <b>Campus: ${campus}</b> • <b>Program: ${prog}</b><br><br>
         You can view the <b>Parent Handbook</b>. If Program is <b>All Programs</b>, you may see multiple results.`
      : `Hi 👋 You’re signed in as <b>Staff</b>.<br>
         <b>Campus: ${campus}</b> • <b>Program: ${prog}</b><br><br>
         Ask about any <b>policy</b>, <b>protocol</b>, or <b>parent handbook</b>.`;

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
  setProgram("ALL");

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

  handbookListCache = [];
  handbookOpenId = null;

  addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);

  const activeHandbookBtn = document.querySelector('.menu-pill[data-menu="handbook"]');
  if (activeHandbookBtn?.classList.contains("active")) {
    await openMenuPanel("handbook");
  }
});

// ============================
// PROGRAM CHANGE
// ============================
programSwitch?.addEventListener("change", () => {
  const p = normalizeProgram(programSwitch.value);
  setProgram(p);

  addMessage("assistant", `✅ Program set to <b>${escapeHtml(programLabel(p))}</b>.`);
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
      if (chatScreen && !chatScreen.classList.contains("hidden")) {
        addMessage("assistant", `Admin PIN error: ${escapeHtml(data.error || "Invalid PIN")}`);
      } else {
        setInlineError(data.error || "Invalid admin PIN");
      }
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

  if (adminModal && adminPinInput && adminPinSubmit && adminPinCancel) {
    adminPinInput.value = "";
    adminModal.classList.remove("hidden");
    adminPinInput.focus();

    adminPinCancel.onclick = () => adminModal.classList.add("hidden");
    adminPinSubmit.onclick = async () => {
      const pin = adminPinInput.value.trim();
      adminModal.classList.add("hidden");
      await enterAdminMode(pin);

      if (isAdminActive()) {
        showChatUI();
        clearChat();
        addMessage(
          "assistant",
          `✅ Admin mode enabled.<br>
           <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b> • <b>Program: ${escapeHtml(programLabel(getProgram()))}</b><br><br>
           You can browse <b>Policies</b>, <b>Protocols</b>, and <b>Parent Handbook</b>, and access <b>Dashboard/Logs</b>.<br>
           To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`
        );
      }
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
  if (role === "parent" && (type === "policies" || type === "protocols")) {
    closeMenuPanel();
    addMessage("assistant", "Parents can only access the Parent Handbook.");
    return;
  }

  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbook";

  menuPanelBody.innerHTML = "";

  if (type === "handbook") {
    await renderHandbookBrowser();
    menuPanel.classList.remove("hidden");
    if (menuOverlay) menuOverlay.classList.remove("hidden");
    return;
  }

  const items = MENU_ITEMS[type] || [];

  if (!items.length) {
    const p = document.createElement("p");
    p.textContent = "Content coming soon.";
    p.className = "muted";
    menuPanelBody.appendChild(p);
  } else {
    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = "Tap an item to ask in chat";
    menuPanelBody.appendChild(label);

    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "menu-item-btn";
      btn.textContent = item.label;

      btn.onclick = () => {
        closeMenuPanel();

        if (!getActiveUserRole()) {
          addMessage(
            "assistant",
            `You’re in <b>Admin mode</b> (dashboard/logs).<br>
             To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`
          );
          return;
        }

        const qPrefix = type === "protocols"
          ? "Please show me the protocol: "
          : "Please show me the policy: ";

        askPolicy(qPrefix + item.label);
      };

      menuPanelBody.appendChild(btn);
    });
  }

  menuPanel.classList.remove("hidden");
  if (menuOverlay) menuOverlay.classList.remove("hidden");
}

function closeMenuPanel() {
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

  const top = document.createElement("div");
  top.className = "handbook-top";
  top.innerHTML = `
    <div><b>Parent Handbook (Campus-based)</b></div>
    <div class="handbook-meta">Current campus: <b>${escapeHtml(campus || "(not selected)")}</b></div>
  `;
  wrap.appendChild(top);

  if (!campus) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Please select a campus first.";
    wrap.appendChild(p);
    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(wrap);
    return;
  }

  if (!token) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Not logged in.";
    wrap.appendChild(p);

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.style.marginTop = "8px";
    hint.innerHTML = `Tip: You can login as <b>Parent</b> or <b>Staff</b> for chat, or use <b>Admin mode</b> to browse.`;
    wrap.appendChild(hint);

    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(wrap);
    return;
  }

  const loading = document.createElement("div");
  loading.className = "muted";
  loading.textContent = "Loading handbooks...";
  wrap.appendChild(loading);

  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(wrap);

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
            <button class="mini-btn" id="hb-back">Back</button>
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
              ? `<button class="primary-btn" id="hb-ask-btn">Ask this section in chat</button>`
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
      <button class="mini-btn" id="hb-back">Back</button>
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

  const program = getProgram(); // ALL | PRESCHOOL | SR_CASA | ELEMENTARY

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ query: trimmed, campus, program })
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

    if (!res.ok || !data.ok) {
      addMessage("assistant", escapeHtml(data.error || "Network error — please try again."));
      return;
    }

    renderResultsBlock(data);
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

  // Reflect LS in header select if present
  if (programSwitch) programSwitch.value = getProgram();

  if (isStaffActive() || isParentActive()) {
    showChatUI();
    clearChat();
    syncModeBadge();

    const role = getActiveUserRole();
    applyRoleUI(role);

    const campus = escapeHtml(getCampus() || "(not selected)");
    const roleLabel = role === "parent" ? "Parent" : "Staff";
    const prog = escapeHtml(programLabel(getProgram()));

    const welcome = role === "parent"
      ? `Welcome back 👋<br>
         Signed in as <b>${roleLabel}</b><br>
         <b>Campus: ${campus}</b> • <b>Program: ${prog}</b><br><br>
         You can view the <b>Parent Handbook</b>.`
      : `Welcome back 👋<br>
         Signed in as <b>${roleLabel}</b><br>
         <b>Campus: ${campus}</b> • <b>Program: ${prog}</b><br><br>
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
       <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b> • <b>Program: ${escapeHtml(programLabel(getProgram()))}</b><br><br>
       You can browse <b>Policies</b>, <b>Protocols</b>, and <b>Parent Handbook</b>, and access <b>Dashboard/Logs</b>.<br>
       To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`
    );
    return;
  }

  showLoginUI();
})();
