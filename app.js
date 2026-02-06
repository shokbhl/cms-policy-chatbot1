// ============================
// CMS Policy Chatbot - app.js (FULL)
// ✅ Adds Program selection (ALL/Preschool/Sr. Casa/Elementary)
// ✅ A+B behavior:
//   - If program chosen => send program to Worker (single best answer)
//   - If program = ALL and answer could be in multiple => Worker returns options[] and UI shows buttons
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
  program: "cms_selected_program" // ✅ NEW
};

const MENU_ITEMS = {
  policies: [
    { id: "safe_arrival", label: "Safe Arrival & Dismissal" },
    { id: "playground_safety", label: "Playground Safety" },
    { id: "anaphylaxis_policy", label: "Anaphylaxis Policy" },
    { id: "medication_administration", label: "Medication Administration" },
    { id: "emergency_management", label: "Emergency Management" }
  ],
  protocols: [
    { id: "program_statement1", label: "CMS Program Statement and Implementation" },
    { id: "non_discrimination", label: "CMS Policies & Procedures and Non-Discrimination / Anti-Racism Policy" }
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
const chatTopHint = document.getElementById("chat-top-hint");

const headerActions = document.getElementById("header-actions");
const logoutBtn = document.getElementById("logout-btn");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

const campusSelect = document.getElementById("campus-select");
const campusSwitch = document.getElementById("campus-switch");

// ✅ Program switch
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

// handbook state
let handbookListCache = [];
let handbookOpenId = null;

// ============================
// UI helpers
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
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = htmlText;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return msg;
}

function addChoiceMessage(promptText, options, originalQuery) {
  // options: [{id,title,program,section_key}]
  const wrapper = document.createElement("div");
  wrapper.className = "msg assistant";

  const safePrompt = escapeHtml(promptText || "Which program do you mean?");
  wrapper.innerHTML = `
    <div>${safePrompt}</div>
    <div class="choice-wrap"></div>
    <div class="muted" style="margin-top:8px;">Tip: You can also choose Program from the top dropdown.</div>
  `;

  const list = wrapper.querySelector(".choice-wrap");
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.type = "button";
    btn.innerHTML = `
      ${escapeHtml(opt.program || "Program")} — ${escapeHtml(opt.title || opt.id)}
      <small>Use this program</small>
    `;
    btn.onclick = async () => {
      // set program dropdown to chosen program
      if (opt.program) setProgram(opt.program);

      // Ask again but force the chosen document
      await askPolicy(originalQuery, { force_doc_id: opt.id, force_section_key: opt.section_key || "" });
    };
    list.appendChild(btn);
  });

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearChat() { chatWindow.innerHTML = ""; }

function showTyping() {
  hideTyping();
  const wrap = document.createElement("div");
  wrap.className = "typing-bubble";
  const dots = document.createElement("div");
  dots.className = "typing-dots";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("div");
    d.className = "typing-dot";
    dots.appendChild(d);
  }
  wrap.appendChild(dots);
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  typingBubble = wrap;
}
function hideTyping() {
  if (typingBubble && typingBubble.parentNode) typingBubble.parentNode.removeChild(typingBubble);
  typingBubble = null;
}

function setInlineError(text) { loginError.textContent = text || ""; }

// ============================
// Campus / Program
// ============================
function normalizeCampus(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeProgram(p) {
  const x = String(p || "").trim();
  if (!x) return "ALL";
  if (x.toUpperCase() === "ALL") return "ALL";
  if (x.toLowerCase().includes("preschool")) return "Preschool";
  if (x.toLowerCase().includes("sr")) return "Sr. Casa";
  if (x.toLowerCase().includes("elementary")) return "Elementary";
  return x;
}

function setCampus(code) {
  const c = normalizeCampus(code);
  if (c) localStorage.setItem(LS.campus, c);
  else localStorage.removeItem(LS.campus);

  if (campusSelect) campusSelect.value = c || "";
  if (campusSwitch) campusSwitch.value = c || "";
  syncTopHint();
}

function getCampus() {
  return normalizeCampus(localStorage.getItem(LS.campus) || "");
}

function setProgram(p) {
  const pr = normalizeProgram(p);
  localStorage.setItem(LS.program, pr);
  if (programSwitch) programSwitch.value = pr;
  syncTopHint();
}

function getProgram() {
  return normalizeProgram(localStorage.getItem(LS.program) || "ALL");
}

function syncTopHint() {
  if (!chatTopHint) return;
  const campus = getCampus() || "—";
  const program = getProgram() || "ALL";
  chatTopHint.innerHTML = `Campus: <b>${escapeHtml(campus)}</b> • Program: <b>${escapeHtml(program === "ALL" ? "All Programs" : program)}</b><br>
  Ask any CMS policy, protocol, or parent handbook question (campus-based).`;
}

// ============================
// Tokens
// ============================
function isTokenActive(tokenKey, untilKey) {
  const token = localStorage.getItem(tokenKey);
  const until = Number(localStorage.getItem(untilKey) || "0");
  return !!token && Date.now() < until;
}
function isStaffActive(){ return isTokenActive(LS.staffToken, LS.staffUntil); }
function isParentActive(){ return isTokenActive(LS.parentToken, LS.parentUntil); }
function isAdminActive(){ return isTokenActive(LS.adminToken, LS.adminUntil); }

function clearStaffSession(){ localStorage.removeItem(LS.staffToken); localStorage.removeItem(LS.staffUntil); }
function clearParentSession(){ localStorage.removeItem(LS.parentToken); localStorage.removeItem(LS.parentUntil); }
function clearAdminSession(){ localStorage.removeItem(LS.adminToken); localStorage.removeItem(LS.adminUntil); }

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
// Mode badge
// ============================
function setModeStaff() {
  modeBadge.textContent = "STAFF";
  modeBadge.classList.remove("admin");
  if (adminLinks) adminLinks.classList.add("hidden");
}
function setModeParent() {
  modeBadge.textContent = "PARENT";
  modeBadge.classList.remove("admin");
  if (adminLinks) adminLinks.classList.add("hidden");
}
function setModeAdmin() {
  modeBadge.textContent = "ADMIN";
  modeBadge.classList.add("admin");
  if (adminLinks) adminLinks.classList.remove("hidden");
}
function syncModeBadge() {
  if (isAdminActive()) setModeAdmin();
  else if (isStaffActive()) setModeStaff();
  else if (isParentActive()) setModeParent();
  else setModeStaff();
}

// ============================
// Role UI guard
// ============================
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
// Ensure top menu
// ============================
function ensureTopMenuBar() {
  topMenuBar = document.getElementById("top-menu-bar");
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
}

// ============================
// Screens
// ============================
function showLoginUI() {
  closeMenuPanel();
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  headerActions.classList.add("hidden");
  topMenuBar.classList.add("hidden");
  syncModeBadge();
}
function showChatUI() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  ensureTopMenuBar();
  headerActions.classList.remove("hidden");
  forceShowTopMenu();
  syncModeBadge();
  applyRoleUI(getActiveUserRole());
  syncTopHint();
}

// ============================
// Login
// ============================
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setInlineError("");

  const code = (accessCodeInput?.value || "").trim();
  const selectedCampus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();

  if (!selectedCampus) return setInlineError("Please select a campus.");
  if (!code) return setInlineError("Please enter Staff or Parent access code.");

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

    const role = out.data.role; // staff|parent
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
    setProgram(getProgram() || "ALL"); // keep or default
    accessCodeInput.value = "";

    showChatUI();
    clearChat();
    syncModeBadge();
    applyRoleUI(role);

    const campus = escapeHtml(getCampus());
    const program = escapeHtml(getProgram() === "ALL" ? "All Programs" : getProgram());
    const isParent = role === "parent";

    const welcome = isParent
      ? `Hi 👋 You’re signed in as <b>Parent</b>.<br><b>Campus: ${campus}</b> • <b>Program: ${program}</b><br><br>
         You can view the <b>Parent Handbook</b> for this campus.`
      : `Hi 👋 You’re signed in as <b>Staff</b>.<br><b>Campus: ${campus}</b> • <b>Program: ${program}</b><br><br>
         Ask about any <b>policy</b>, <b>protocol</b>, or <b>parent handbook</b>.`;

    addMessage("assistant", welcome);
  } catch {
    setInlineError("Could not connect to server.");
  }
});

// Logout
logoutBtn?.addEventListener("click", () => {
  closeMenuPanel();
  clearChat();
  clearStaffSession();
  clearParentSession();
  clearAdminSession();
  accessCodeInput.value = "";
  setInlineError("");
  setCampus("");
  setProgram("ALL");
  showLoginUI();
});

// Campus change
campusSelect?.addEventListener("change", () => setCampus(normalizeCampus(campusSelect.value)));
campusSwitch?.addEventListener("change", async () => {
  const c = normalizeCampus(campusSwitch.value);
  if (!c) return;
  setCampus(c);
  handbookListCache = [];
  handbookOpenId = null;

  addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);
  const hbBtn = document.querySelector('.menu-pill[data-menu="handbook"]');
  if (hbBtn?.classList.contains("active")) await openMenuPanel("handbook");
});

// ✅ Program change
programSwitch?.addEventListener("change", async () => {
  setProgram(programSwitch.value);

  // reset handbook cache; optional
  handbookListCache = [];
  handbookOpenId = null;

  addMessage("assistant", `✅ Program set to <b>${escapeHtml(getProgram() === "ALL" ? "All Programs" : getProgram())}</b>.`);

  const hbBtn = document.querySelector('.menu-pill[data-menu="handbook"]');
  if (hbBtn?.classList.contains("active")) await openMenuPanel("handbook");
});

// ============================
// Admin mode
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

  if (adminModal) {
    adminPinInput.value = "";
    adminModal.classList.remove("hidden");
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

loginAdminBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (isAdminActive()) {
    clearAdminSession();
    syncModeBadge();
    setInlineError("Admin mode disabled.");
    return;
  }

  if (adminModal) {
    adminPinInput.value = "";
    adminModal.classList.remove("hidden");
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
           <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b> • <b>Program: ${escapeHtml(getProgram() === "ALL" ? "All Programs" : getProgram())}</b><br><br>
           You can browse <b>Policies</b>, <b>Protocols</b>, and <b>Parent Handbook</b>, and access <b>Dashboard/Logs</b>.<br>
           To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`
        );
      }
    };
    return;
  }

  const pin = prompt("Enter Admin PIN:");
  if (pin) await enterAdminMode(pin);
});

// ============================
// Menu panel (unchanged core)
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
  menuPanelTitle.textContent = type === "policies" ? "Policies" : type === "protocols" ? "Protocols" : "Parent Handbook";
  menuPanelBody.innerHTML = "";

  if (type === "handbook") {
    await renderHandbookBrowser();
    menuPanel.classList.remove("hidden");
    menuOverlay.classList.remove("hidden");
    return;
  }

  const items = MENU_ITEMS[type] || [];
  if (!items.length) {
    menuPanelBody.innerHTML = `<p class="muted">Content coming soon.</p>`;
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
          addMessage("assistant", `You’re in <b>Admin mode</b>. To ask questions, login with a Staff or Parent code.`);
          return;
        }
        const qPrefix = type === "protocols" ? "Please show me the protocol: " : "Please show me the policy: ";
        askPolicy(qPrefix + item.label);
      };
      menuPanelBody.appendChild(btn);
    });
  }

  menuPanel.classList.remove("hidden");
  menuOverlay.classList.remove("hidden");
}

function closeMenuPanel() {
  menuPanel.classList.add("hidden");
  menuOverlay.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

// ============================
// Handbook browser (filters by Program if selected)
// ============================
async function fetchHandbookListForCampus(campus) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");

  const program = getProgram();
  const qs = new URLSearchParams({ campus });
  if (program && program !== "ALL") qs.set("program", program);

  const res = await fetch(`${HANDBOOKS_URL}?${qs.toString()}`, {
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

  const qs = new URLSearchParams({ campus, id: handbookId, section: sectionKey });
  const res = await fetch(`${HANDBOOKS_URL}?${qs.toString()}`, {
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

  const programLabel = getProgram() === "ALL" ? "All Programs" : getProgram();

  wrap.innerHTML = `
    <div class="handbook-top">
      <div><b>Parent Handbook (Campus-based)</b></div>
      <div class="handbook-meta">Campus: <b>${escapeHtml(campus || "(not selected)")}</b> • Program: <b>${escapeHtml(programLabel)}</b></div>
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

  const loading = document.createElement("div");
  loading.className = "muted";
  loading.textContent = "Loading handbooks...";
  wrap.appendChild(loading);

  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(wrap);

  try {
    handbookListCache = await fetchHandbookListForCampus(campus);
    loading.remove();

    if (!handbookListCache.length) {
      wrap.innerHTML += `<p class="muted">No handbooks found for this campus/program yet.</p>`;
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
          secWrap.innerHTML = `<div class="muted">No sections in this handbook.</div>`;
        } else {
          secs.forEach((sec) => {
            const sBtn = document.createElement("button");
            sBtn.className = "hb-section-btn";
            sBtn.type = "button";
            sBtn.textContent = sec.title || sec.key || "Section";
            sBtn.onclick = async () => {
              const data = await fetchHandbookSection(campus, hb.id, sec.key);
              const section = data.section || {};
              closeMenuPanel();
              addMessage(
                "assistant",
                `<b>${escapeHtml(data.handbook?.title || hb.title)}</b><br>
                 <div class="muted">Program: <b>${escapeHtml(data.handbook?.program || hb.program || "")}</b></div><br>
                 ${escapeHtml(section.content || "No content yet.")}`
              );
            };
            secWrap.appendChild(sBtn);
          });
        }

        wrap.appendChild(secWrap);
      }
    });
  } catch (err) {
    loading.remove();
    wrap.innerHTML += `<p class="muted">${escapeHtml(err?.message || "Could not load handbooks.")}</p>`;
  }
}

// ============================
// Chat / API (handles choose mode)
// ============================
async function askPolicy(question, extra = {}) {
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
    addMessage("assistant", `You’re in <b>Admin mode</b>. To ask questions, login with a Staff or Parent code.`);
    return;
  }

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const body = {
      query: trimmed,
      campus,
      program: getProgram(), // ✅ NEW
      ...extra // force_doc_id, force_section_key, ...
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    hideTyping();

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

    // ✅ If Worker says: choose between multiple
    if (data.mode === "choose" && Array.isArray(data.options) && data.options.length) {
      addChoiceMessage(data.prompt || "This question applies to multiple programs. Which program do you mean?", data.options, trimmed);
      return;
    }

    // normal answer
    const title = data.source?.title || "Answer:";
    const answer = data.answer || "";
    const linkPart = data.source?.link
      ? `<br><br><a href="${escapeHtml(data.source.link)}" target="_blank" rel="noopener">Open full document</a>`
      : "";

    const progPart = data.source?.program ? `<div class="muted">Program: <b>${escapeHtml(data.source.program)}</b></div><br>` : "";

    addMessage("assistant", `<b>${escapeHtml(title)}</b><br>${progPart}${escapeHtml(answer)}${linkPart}`);
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
  else setProgram(getProgram());

  if (isStaffActive() || isParentActive()) {
    showChatUI();
    clearChat();
    syncModeBadge();
    applyRoleUI(getActiveUserRole());

    const campus = escapeHtml(getCampus() || "(not selected)");
    const program = escapeHtml(getProgram() === "ALL" ? "All Programs" : getProgram());
    const role = getActiveUserRole();
    const roleLabel = role === "parent" ? "Parent" : "Staff";

    addMessage(
      "assistant",
      `Welcome back 👋<br>
       Signed in as <b>${roleLabel}</b><br>
       <b>Campus: ${campus}</b> • <b>Program: ${program}</b><br><br>
       Ask any CMS question. If your question applies to multiple programs, I’ll ask you to pick one.`
    );
    return;
  }

  if (isAdminActive()) {
    showChatUI();
    clearChat();
    syncModeBadge();
    applyRoleUI("");

    addMessage(
      "assistant",
      `✅ Admin mode enabled.<br>
       <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b> • <b>Program: ${escapeHtml(getProgram() === "ALL" ? "All Programs" : getProgram())}</b><br><br>
       You can browse <b>Policies</b>, <b>Protocols</b>, and <b>Parent Handbook</b>, and access <b>Dashboard/Logs</b>.<br>
       To ask questions in chat, login with a <b>Staff</b> or <b>Parent</b> code.`
    );
    return;
  }

  showLoginUI();
})();
