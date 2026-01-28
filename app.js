// ============================
// CMS Policy Chatbot - app.js (ROLE-BASED + HANDBOOK LIST/SECTIONS)
// - Staff + Parent login from same page
// - Campus required (blank default)
// - Parent sees ONLY Handbooks
// - Handbook list per campus + section click to view content
// - Campus switch message in chat
// ============================

// ===== CONFIG =====
const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const PARENT_AUTH_URL = `${WORKER_BASE}/auth/parent`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;

const HANDBOOK_LIST_URL = `${WORKER_BASE}/handbooks`; // GET ?campus=YC
const HANDBOOK_SECTION_URL = `${WORKER_BASE}/handbooks/section`; // GET ?campus=YC&handbookId=...&sectionKey=...

// ===== LocalStorage keys =====
const LS = {
  token: "cms_token",
  until: "cms_until",
  role: "cms_role", // staff | parent
  campus: "cms_selected_campus",

  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

// ===== MENU ITEMS (static for policies/protocols) =====
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
    { id: "serious_occurrence", label: "Serious Occurrence" },
    { id: "sleep_toddlers", label: "Sleep Supervision – Toddler & Preschool" },
    { id: "sleep_infants", label: "Sleep Supervision – Infants" },
    { id: "students_volunteers", label: "Supervision of Students & Volunteers" }
  ]
};

// ===== DOM =====
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

const campusSelect = document.getElementById("campus-select"); // login select (REQUIRED)
const campusSwitch = document.getElementById("campus-switch"); // header select (optional)

// Admin optional
const adminModeBtn = document.getElementById("admin-mode-btn");
const modeBadge = document.getElementById("mode-badge");
const adminModal = document.getElementById("admin-modal");
const adminPinInput = document.getElementById("admin-pin");
const adminPinSubmit = document.getElementById("admin-pin-submit");
const adminPinCancel = document.getElementById("admin-pin-cancel");
const adminLinks = document.getElementById("admin-links");

// Menu bar + pills
let topMenuBar = document.getElementById("top-menu-bar");
let menuPills = document.querySelectorAll(".menu-pill");

// Menu panel
const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

// typing indicator
let typingBubble = null;

// Cached handbooks for current campus
let cachedHandbooks = []; // array of handbook docs
let selectedHandbookId = ""; // current selected handbook id (for section fetching)

// ============================
// HELPERS
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

function setRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r) localStorage.setItem(LS.role, r);
  else localStorage.removeItem(LS.role);
}
function getRole() {
  return String(localStorage.getItem(LS.role) || "").trim().toLowerCase();
}

function isSessionActive() {
  const token = localStorage.getItem(LS.token);
  const until = Number(localStorage.getItem(LS.until) || "0");
  return !!token && Date.now() < until;
}

function getToken() {
  return localStorage.getItem(LS.token) || "";
}

function clearSession() {
  localStorage.removeItem(LS.token);
  localStorage.removeItem(LS.until);
  localStorage.removeItem(LS.role);
}

function isAdminActive() {
  const token = localStorage.getItem(LS.adminToken);
  const until = Number(localStorage.getItem(LS.adminUntil) || "0");
  return !!token && Date.now() < until;
}
function clearAdminSession() {
  localStorage.removeItem(LS.adminToken);
  localStorage.removeItem(LS.adminUntil);
}

function setModeStaff() {
  if (modeBadge) {
    modeBadge.textContent = "STAFF";
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

// ============================
// TOP MENU visibility + role rules
// ============================
function ensureTopMenuBar() {
  topMenuBar = document.getElementById("top-menu-bar");
  if (!topMenuBar) return;

  menuPills = document.querySelectorAll(".menu-pill");

  // bind click
  menuPills.forEach((btn) => {
    btn.onclick = () => {
      const type = btn.dataset.menu;
      if (btn.classList.contains("active")) closeMenuPanel();
      else openMenuPanel(type);
    };
  });

  if (menuPanelClose) menuPanelClose.onclick = closeMenuPanel;
  if (menuOverlay) menuOverlay.onclick = closeMenuPanel;
}

function showTopMenu() {
  if (!topMenuBar) return;
  topMenuBar.classList.remove("hidden");
  topMenuBar.style.display = "block";
  topMenuBar.style.visibility = "visible";
  topMenuBar.style.opacity = "1";
}

function hideTopMenu() {
  if (!topMenuBar) return;
  topMenuBar.classList.add("hidden");
}

function applyRoleUI() {
  const role = getRole(); // staff | parent

  // Parent: hide policies/protocols pills + admin UI
  const policiesPill = document.querySelector('.menu-pill[data-menu="policies"]');
  const protocolsPill = document.querySelector('.menu-pill[data-menu="protocols"]');
  const handbookPill = document.querySelector('.menu-pill[data-menu="handbook"]');

  if (role === "parent") {
    if (policiesPill) policiesPill.classList.add("hidden");
    if (protocolsPill) protocolsPill.classList.add("hidden");
    if (handbookPill) handbookPill.classList.remove("hidden");

    if (adminModeBtn) adminModeBtn.classList.add("hidden");
    if (modeBadge) modeBadge.classList.add("hidden");
    if (adminLinks) adminLinks.classList.add("hidden");
  } else {
    if (policiesPill) policiesPill.classList.remove("hidden");
    if (protocolsPill) protocolsPill.classList.remove("hidden");
    if (handbookPill) handbookPill.classList.remove("hidden");

    if (adminModeBtn) adminModeBtn.classList.remove("hidden");
    if (modeBadge) modeBadge.classList.remove("hidden");
  }

  // Campus switch: parent can see but you may want to lock it; for now allow change
  // If you want to lock for parent: add campusSwitch?.setAttribute("disabled","disabled");
}

// ============================
// SCREEN TOGGLES
// ============================
function showLoginUI() {
  closeMenuPanel();
  if (chatScreen) chatScreen.classList.add("hidden");
  if (loginScreen) loginScreen.classList.remove("hidden");

  if (headerActions) headerActions.classList.add("hidden");
  hideTopMenu();

  // On login screen we want blank campus by default
  setCampus(getCampus()); // keep if saved
}

function showChatUI() {
  if (loginScreen) loginScreen.classList.add("hidden");
  if (chatScreen) chatScreen.classList.remove("hidden");

  ensureTopMenuBar();

  if (headerActions) headerActions.classList.remove("hidden");
  showTopMenu();

  applyRoleUI();
}

// ============================
// AUTH (Staff OR Parent)
// ============================
async function authWithCode(code) {
  // Try staff first, if fails try parent
  const body = JSON.stringify({ code });

  // staff
  let res = await fetch(STAFF_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

  let data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) {
    return { ok: true, role: "staff", token: data.token, expires_in: data.expires_in || 28800 };
  }

  // parent
  res = await fetch(PARENT_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

  data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) {
    return { ok: true, role: "parent", token: data.token, expires_in: data.expires_in || 28800 };
  }

  return { ok: false, error: data.error || "Invalid code." };
}

// Login submit
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (loginError) loginError.textContent = "";

  const code = (accessCodeInput?.value || "").trim();
  const campus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();

  if (!campus) {
    if (loginError) loginError.textContent = "Please select a campus.";
    return;
  }
  if (!code) {
    if (loginError) loginError.textContent = "Please enter access code.";
    return;
  }

  try {
    const auth = await authWithCode(code);
    if (!auth.ok) {
      if (loginError) loginError.textContent = auth.error || "Login failed.";
      return;
    }

    // save session
    localStorage.setItem(LS.token, auth.token);
    localStorage.setItem(LS.until, String(Date.now() + auth.expires_in * 1000));
    setRole(auth.role);

    setCampus(campus);

    if (accessCodeInput) accessCodeInput.value = "";

    // Admin visuals (staff only)
    if (auth.role === "staff") {
      if (isAdminActive()) setModeAdmin();
      else setModeStaff();
    } else {
      // parent -> no admin
      clearAdminSession();
      setModeStaff();
    }

    showChatUI();
    clearChat();

    addMessage(
      "assistant",
      auth.role === "parent"
        ? `Welcome 👋<br><b>Parent Handbook</b> mode enabled.<br><b>Campus: ${escapeHtml(getCampus())}</b><br><br>
           Tap <b>Parent Handbook</b> in the top menu to browse handbooks & sections.`
        : `Hi 👋 You’re signed in.<br><b>Campus: ${escapeHtml(getCampus())}</b><br><br>
           Ask about any policy, protocol, or the parent handbook for this campus.`
    );
  } catch {
    if (loginError) loginError.textContent = "Could not connect to server.";
  }
});

// Logout
logoutBtn?.addEventListener("click", () => {
  closeMenuPanel();
  clearChat();

  clearSession();
  clearAdminSession();

  if (accessCodeInput) accessCodeInput.value = "";
  if (loginError) loginError.textContent = "";

  // reset campus on login page to blank
  if (campusSelect) campusSelect.value = "";
  setCampus("");

  showLoginUI();
});

// Campus change events
campusSelect?.addEventListener("change", () => {
  const c = normalizeCampus(campusSelect.value);
  setCampus(c);
});
campusSwitch?.addEventListener("change", () => {
  const c = normalizeCampus(campusSwitch.value);
  if (!c) return;
  setCampus(c);

  // Clear handbook cache when campus changes
  cachedHandbooks = [];
  selectedHandbookId = "";

  addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);
});

// ============================
// ADMIN MODE (staff only)
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

    setModeAdmin();
    addMessage("assistant", "✅ Admin mode enabled (8 hours).");
  } catch {
    addMessage("assistant", "Admin login failed (network).");
  }
}

adminModeBtn?.addEventListener("click", () => {
  if (getRole() === "parent") {
    addMessage("assistant", "Admin mode is not available in Parent view.");
    return;
  }

  if (isAdminActive()) {
    clearAdminSession();
    setModeStaff();
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

// ============================
// HANDBOOK FETCHERS
// ============================
async function fetchHandbooksForCampus(campus) {
  const c = normalizeCampus(campus);
  if (!c) return [];

  const url = `${HANDBOOK_LIST_URL}?campus=${encodeURIComponent(c)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${getToken()}` } // session token
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return [];

  return Array.isArray(data.handbooks) ? data.handbooks : [];
}

async function fetchSectionContent(campus, handbookId, sectionKey) {
  const c = normalizeCampus(campus);
  const url =
    `${HANDBOOK_SECTION_URL}?campus=${encodeURIComponent(c)}&handbookId=${encodeURIComponent(handbookId)}&sectionKey=${encodeURIComponent(sectionKey)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${getToken()}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return null;
  return data; // { ok, handbook_id, section_key, title, content, link }
}

// ============================
// MENU PANEL
// ============================
async function openMenuPanel(type) {
  if (!menuPanel || !menuPanelBody || !menuPanelTitle) return;

  // If parent role, force handbook only
  const role = getRole();
  if (role === "parent" && type !== "handbook") {
    type = "handbook";
  }

  // active pill highlight
  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbook";

  menuPanelBody.innerHTML = "";

  // HANDBOOK PANEL (list -> select -> sections)
  if (type === "handbook") {
    const campus = getCampus();
    if (!campus) {
      const p = document.createElement("p");
      p.textContent = "Please select a campus first.";
      p.style.color = "#6b7280";
      menuPanelBody.appendChild(p);
      showPanel();
      return;
    }

    // Load from cache or fetch
    if (!cachedHandbooks.length) {
      const loading = document.createElement("p");
      loading.textContent = "Loading handbooks…";
      loading.style.color = "#6b7280";
      menuPanelBody.appendChild(loading);

      cachedHandbooks = await fetchHandbooksForCampus(campus);
      menuPanelBody.innerHTML = "";
    }

    if (!cachedHandbooks.length) {
      const p = document.createElement("p");
      p.innerHTML = `No handbooks found for <b>${escapeHtml(campus)}</b>.`;
      p.style.color = "#6b7280";
      menuPanelBody.appendChild(p);
      showPanel();
      return;
    }

    // If no handbook selected yet -> show handbook list
    if (!selectedHandbookId) {
      const label = document.createElement("div");
      label.className = "menu-group-label";
      label.textContent = `Handbooks for ${campus} (tap one)`;
      menuPanelBody.appendChild(label);

      cachedHandbooks.forEach((hb) => {
        const btn = document.createElement("button");
        btn.className = "menu-item-btn";
        btn.innerHTML = `<b>${escapeHtml(hb.program || "")}</b><br><span style="font-size:0.86rem;color:#4b5563">${escapeHtml(hb.title || hb.id)}</span>`;
        btn.onclick = () => {
          selectedHandbookId = hb.id;
          openMenuPanel("handbook"); // re-render to show sections
        };
        menuPanelBody.appendChild(btn);
      });

      showPanel();
      return;
    }

    // Handbook selected -> show sections list
    const hb = cachedHandbooks.find((x) => x.id === selectedHandbookId);
    if (!hb) {
      selectedHandbookId = "";
      openMenuPanel("handbook");
      return;
    }

    // Back button
    const back = document.createElement("button");
    back.className = "menu-item-btn";
    back.textContent = "← Back to handbook list";
    back.onclick = () => {
      selectedHandbookId = "";
      openMenuPanel("handbook");
    };
    menuPanelBody.appendChild(back);

    const title = document.createElement("div");
    title.className = "menu-group-label";
    title.textContent = `Sections: ${hb.program || hb.title || hb.id}`;
    menuPanelBody.appendChild(title);

    // Optional link
    if (hb.link) {
      const a = document.createElement("a");
      a.href = hb.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "admin-link"; // reuse style
      a.textContent = "Open full handbook";
      a.style.display = "inline-block";
      a.style.margin = "6px 0 10px";
      menuPanelBody.appendChild(a);
    }

    const sections = Array.isArray(hb.sections) ? hb.sections : [];
    if (!sections.length) {
      const p = document.createElement("p");
      p.textContent = "No sections defined for this handbook yet.";
      p.style.color = "#6b7280";
      menuPanelBody.appendChild(p);
      showPanel();
      return;
    }

    sections.forEach((sec) => {
      const btn = document.createElement("button");
      btn.className = "menu-item-btn";
      btn.innerHTML = `${escapeHtml(sec.title || sec.key)}`;
      btn.onclick = async () => {
        closeMenuPanel();

        // Fetch section content and show it in chat
        addMessage("assistant", "🔎 Loading section…");
        const data = await fetchSectionContent(campus, hb.id, sec.key);

        if (!data) {
          addMessage("assistant", "Could not load this section.");
          return;
        }

        const content = data.content || "(No content yet)";
        const linkPart = data.link
          ? `<br><br><a href="${escapeHtml(data.link)}" target="_blank" rel="noopener">Open full handbook</a>`
          : "";

        addMessage(
          "assistant",
          `<b>${escapeHtml(hb.title || hb.id)}</b><br>
           <span style="color:#6b7280;font-size:0.9rem">Section: ${escapeHtml(data.title || sec.title || sec.key)}</span><br><br>
           ${escapeHtml(content)}${linkPart}`
        );
      };
      menuPanelBody.appendChild(btn);
    });

    showPanel();
    return;
  }

  // POLICIES / PROTOCOLS
  const items = MENU_ITEMS[type] || [];
  if (!items.length) {
    const p = document.createElement("p");
    p.textContent = "Content coming soon.";
    p.style.color = "#6b7280";
    menuPanelBody.appendChild(p);
  } else {
    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = "Tap an item to view details";
    menuPanelBody.appendChild(label);

    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "menu-item-btn";
      btn.textContent = item.label;
      btn.onclick = () => {
        closeMenuPanel();
        const qPrefix = type === "protocols"
          ? "Please show me the protocol: "
          : "Please show me the policy: ";
        askPolicy(qPrefix + item.label);
      };
      menuPanelBody.appendChild(btn);
    });
  }

  showPanel();
}

function showPanel() {
  menuPanel.classList.remove("hidden");
  if (menuOverlay) menuOverlay.classList.remove("hidden");
}

function closeMenuPanel() {
  menuPanel?.classList.add("hidden");
  menuOverlay?.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

// ============================
// CHAT / API
// ============================
async function askPolicy(question) {
  if (!isSessionActive()) {
    addMessage("assistant", "Session expired. Please login again.");
    clearSession();
    clearAdminSession();
    showLoginUI();
    return;
  }

  const trimmed = String(question || "").trim();
  if (!trimmed) return;

  const campus = getCampus();
  if (!campus) {
    addMessage("assistant", "Please select a campus first.");
    return;
  }

  const role = getRole() || "staff";
  const adminRole = isAdminActive() ? "admin" : role;

  // Parent restriction: force handbook-only questions (still allow general query, worker should enforce)
  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ query: trimmed, campus, role: adminRole })
    });

    hideTyping();

    if (res.status === 429) {
      addMessage("assistant", "Too many requests. Please wait a moment and try again.");
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      addMessage("assistant", escapeHtml(data.error || "Unauthorized. Please login again."));
      clearSession();
      clearAdminSession();
      showLoginUI();
      return;
    }

    if (!res.ok) {
      addMessage("assistant", escapeHtml(data.error || "Network error — please try again."));
      return;
    }

    const title = data.policy?.title || "Answer:";
    const answer = data.answer || "";

    const linkPart = data.policy?.link
      ? `<br><br><a href="${escapeHtml(data.policy.link)}" target="_blank" rel="noopener">Open full document</a>`
      : "";

    addMessage("assistant", `<b>${escapeHtml(title)}</b><br><br>${escapeHtml(answer)}${linkPart}`);
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

  // If no campus saved, keep blank
  if (!getCampus()) setCampus("");

  // cleanup expired sessions
  if (!isSessionActive()) {
    clearSession();
    clearAdminSession();
  }
  if (!isAdminActive()) clearAdminSession();

  if (isSessionActive()) {
    showChatUI();
    clearChat();

    // Admin UI only for staff
    if (getRole() === "staff") {
      if (isAdminActive()) setModeAdmin();
      else setModeStaff();
    }

    addMessage(
      "assistant",
      `Welcome back 👋<br><b>Role: ${escapeHtml(getRole() || "staff")}</b><br><b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>
       Tap <b>Parent Handbook</b> to browse handbooks & sections.`
    );
  } else {
    showLoginUI();
  }
})();