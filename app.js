// ============================
// CMS Policy Chatbot - app.js (PARENT MODE + HANDBOOK LIST + SECTIONS CLICKABLE)
// Requires Worker endpoints:
// - POST /auth/staff {code}
// - POST /auth/parent {code}
// - POST /auth/admin {pin}
// - POST /api {query,campus}
// - GET  /handbooks?campus=YC   <-- needed for handbook list UI
// - GET  /admin/logs, /admin/stats
// ============================

// ===== CONFIG =====
const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const PARENT_AUTH_URL = `${WORKER_BASE}/auth/parent`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;
const HANDBOOKS_URL = `${WORKER_BASE}/handbooks`; // GET ?campus=YC

// ===== LocalStorage keys =====
const LS = {
  token: "cms_token",          // staff or parent token
  until: "cms_until",
  userRole: "cms_user_role",   // staff | parent
  campus: "cms_selected_campus",
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

// ===== MENU ITEMS (staff only) =====
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

let topMenuBar = document.getElementById("top-menu-bar");
let menuPills = document.querySelectorAll(".menu-pill");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

const campusSelect = document.getElementById("campus-select"); // login select
const campusSwitch = document.getElementById("campus-switch"); // header select

const adminModeBtn = document.getElementById("admin-mode-btn");
const modeBadge = document.getElementById("mode-badge");
const adminModal = document.getElementById("admin-modal");
const adminPinInput = document.getElementById("admin-pin");
const adminPinSubmit = document.getElementById("admin-pin-submit");
const adminPinCancel = document.getElementById("admin-pin-cancel");
const adminLinks = document.getElementById("admin-links");

// typing indicator
let typingBubble = null;

// handbook cache (per campus)
let handbookCache = {
  campus: "",
  items: [] // [{id,title,program,sections:[{key,title}]}]
};

// ============================
// HELPERS - UI
// ============================
function escapeHtml(s) {
  return String(s)
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
}

function clearChat() {
  chatWindow.innerHTML = "";
}

function showTyping() {
  hideTyping();

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
  if (typingBubble && typingBubble.parentNode) {
    typingBubble.parentNode.removeChild(typingBubble);
  }
  typingBubble = null;
}

function showLoginUI() {
  closeMenuPanel();
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  headerActions.classList.add("hidden");

  ensureTopMenuBar();
  topMenuBar.classList.add("hidden");
  topMenuBar.style.display = "";

  // Default: campus blank on login
  setCampus("");

  setModeStaff();
}

function showChatUI() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  headerActions.classList.remove("hidden");

  ensureTopMenuBar();
  topMenuBar.classList.remove("hidden");
  topMenuBar.style.display = "block";
}

// ============================
// HELPERS - Session / Campus / Role
// ============================
function normalizeCampus(code) {
  return (code || "").trim().toUpperCase();
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

function isTokenActive() {
  const token = localStorage.getItem(LS.token);
  const until = Number(localStorage.getItem(LS.until) || "0");
  return !!token && Date.now() < until;
}

function getToken() {
  return localStorage.getItem(LS.token) || "";
}

function getUserRole() {
  return (localStorage.getItem(LS.userRole) || "staff").trim();
}

function setUserRole(r) {
  localStorage.setItem(LS.userRole, r);
}

function isParent() {
  return getUserRole() === "parent";
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
    modeBadge.textContent = isParent() ? "PARENT" : "STAFF";
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
// TOP MENU (ensure exists + bind + show/hide by role)
// ============================
function ensureTopMenuBar() {
  topMenuBar = document.getElementById("top-menu-bar");
  if (!topMenuBar) return;

  menuPills = document.querySelectorAll(".menu-pill");

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

function applyRoleToUI() {
  // Parent: hide policies/protocols pills
  const pills = Array.from(document.querySelectorAll(".menu-pill"));
  for (const p of pills) {
    const t = p.dataset.menu;
    if (isParent() && (t === "policies" || t === "protocols")) {
      p.classList.add("hidden");
    } else {
      p.classList.remove("hidden");
    }
  }

  // Parent: hide admin button
  if (adminModeBtn) {
    if (isParent()) adminModeBtn.classList.add("hidden");
    else adminModeBtn.classList.remove("hidden");
  }

  // Badge
  if (!isAdminActive()) setModeStaff();
}

// ============================
// AUTH: Login Staff or Parent (single field)
// tries staff first, then parent
// ============================
async function tryLoginWithCode(code) {
  // Try staff
  let res = await fetch(STAFF_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  let data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) return { ...data, role: "staff" };

  // Try parent
  res = await fetch(PARENT_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) return { ...data, role: "parent" };

  // Return last error
  return { ok: false, error: data?.error || "Invalid code" };
}

// ============================
// LOGIN
// ============================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  loginError.textContent = "";

  const code = (accessCodeInput.value || "").trim();
  const campus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();

  if (!campus) {
    loginError.textContent = "Please select a campus.";
    return;
  }
  if (!code) {
    loginError.textContent = "Please enter access code.";
    return;
  }

  try {
    const data = await tryLoginWithCode(code);

    if (!data.ok) {
      loginError.textContent = data.error || "Invalid code.";
      return;
    }

    // Save session (staff or parent)
    localStorage.setItem(LS.token, data.token);
    localStorage.setItem(LS.until, String(Date.now() + (data.expires_in || 28800) * 1000));
    setUserRole(data.role || "staff");

    setCampus(campus);
    accessCodeInput.value = "";

    showChatUI();
    clearChat();
    applyRoleToUI();

    addMessage(
      "assistant",
      `Hi 👋 You’re signed in as <b>${escapeHtml(getUserRole().toUpperCase())}</b>.<br>
       <b>Campus: ${escapeHtml(getCampus())}</b><br><br>
       ${isParent() ? "You can ask about the <b>Parent Handbook</b> for your campus." : "Ask about any policy, protocol, or parent handbook for this campus."}`
    );

    // preload handbooks for campus (for Parent Handbook panel)
    await loadHandbooksForCampus(getCampus());
  } catch {
    loginError.textContent = "Could not connect to server.";
  }
});

// ============================
// LOGOUT
// ============================
logoutBtn.addEventListener("click", () => {
  closeMenuPanel();
  clearChat();

  localStorage.removeItem(LS.token);
  localStorage.removeItem(LS.until);
  localStorage.removeItem(LS.userRole);

  clearAdminSession();

  accessCodeInput.value = "";
  loginError.textContent = "";

  // reset campus to blank
  setCampus("");

  showLoginUI();
});

// ============================
// CAMPUS SWITCH (header)
// ============================
if (campusSelect) {
  campusSelect.addEventListener("change", () => {
    const c = normalizeCampus(campusSelect.value);
    setCampus(c);
  });
}

if (campusSwitch) {
  campusSwitch.addEventListener("change", async () => {
    const c = normalizeCampus(campusSwitch.value);
    if (!c) return;

    setCampus(c);
    addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);

    // refresh handbook list cache for this campus
    await loadHandbooksForCampus(getCampus());
  });
}

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

if (adminModeBtn) {
  adminModeBtn.addEventListener("click", () => {
    if (isParent()) return;

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
}

// ============================
// HANDBOOK LIST LOADER
// ============================
async function loadHandbooksForCampus(campus) {
  const c = normalizeCampus(campus);
  if (!c) return;

  // If already loaded for same campus, skip
  if (handbookCache.campus === c && Array.isArray(handbookCache.items) && handbookCache.items.length) return;

  try {
    const res = await fetch(`${HANDBOOKS_URL}?campus=${encodeURIComponent(c)}`, {
      method: "GET"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      handbookCache = { campus: c, items: [] };
      return;
    }

    handbookCache = {
      campus: c,
      items: Array.isArray(data.items) ? data.items : []
    };
  } catch {
    handbookCache = { campus: c, items: [] };
  }
}

// ============================
// MENU PANEL
// ============================
function openMenuPanel(type) {
  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  // Parent: only handbook allowed
  if (isParent() && type !== "handbook") {
    closeMenuPanel();
    return;
  }

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbook";

  menuPanelBody.innerHTML = "";

  if (type === "handbook") {
    renderHandbookPanel();
    menuPanel.classList.remove("hidden");
    menuOverlay.classList.add("active");
    menuOverlay.classList.remove("hidden");
    return;
  }

  // staff only: policies/protocols list
  const items = MENU_ITEMS[type] || [];
  if (items.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Content coming soon.";
    p.style.fontSize = "0.9rem";
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
      btn.addEventListener("click", () => {
        closeMenuPanel();
        const qPrefix =
          type === "protocols"
            ? "Please show me the protocol: "
            : "Please show me the policy: ";
        askApi(qPrefix + item.label);
      });
      menuPanelBody.appendChild(btn);
    });
  }

  menuPanel.classList.remove("hidden");
  menuOverlay.classList.add("active");
  menuOverlay.classList.remove("hidden");
}

function closeMenuPanel() {
  menuPanel.classList.add("hidden");
  menuOverlay.classList.remove("active");
  menuOverlay.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

menuOverlay?.addEventListener("click", closeMenuPanel);
menuPanelClose?.addEventListener("click", closeMenuPanel);

// ============================
// HANDBOOK PANEL RENDER (list + sections clickable)
// ============================
async function renderHandbookPanel() {
  const campus = getCampus();
  if (!campus) {
    const p = document.createElement("p");
    p.className = "helper-text";
    p.innerHTML = `Please select a campus first.`;
    menuPanelBody.appendChild(p);
    return;
  }

  await loadHandbooksForCampus(campus);

  const header = document.createElement("div");
  header.className = "handbook-header";
  header.innerHTML = `
    <div>
      <div style="font-weight:700;">Handbooks for campus: <b>${escapeHtml(campus)}</b></div>
      <div class="muted" style="margin-top:4px;">Tap a handbook, then tap a section to ask about it.</div>
    </div>
  `;
  menuPanelBody.appendChild(header);

  if (!handbookCache.items.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.style.marginTop = "10px";
    p.textContent = "No handbooks found for this campus yet.";
    menuPanelBody.appendChild(p);

    const tip = document.createElement("p");
    tip.className = "muted";
    tip.style.marginTop = "8px";
    tip.textContent = "Make sure KV key exists: handbook_<CAMPUS> (e.g., handbook_YC).";
    menuPanelBody.appendChild(tip);
    return;
  }

  // list of handbooks
  const list = document.createElement("div");
  list.className = "handbook-list";

  handbookCache.items.forEach((hb) => {
    const card = document.createElement("div");
    card.className = "handbook-card";

    const top = document.createElement("div");
    top.className = "handbook-card-top";
    top.innerHTML = `
      <div class="handbook-title">${escapeHtml(hb.title || hb.id)}</div>
      <div class="handbook-meta">${escapeHtml(hb.program || "")}</div>
    `;

    // sections (collapsed by default)
    const sectionsWrap = document.createElement("div");
    sectionsWrap.className = "sections-wrap hidden";

    const sections = Array.isArray(hb.sections) ? hb.sections : [];
    if (!sections.length) {
      const none = document.createElement("div");
      none.className = "muted";
      none.style.padding = "8px 0 0 0";
      none.textContent = "No sections listed.";
      sectionsWrap.appendChild(none);
    } else {
      sections.forEach((sec) => {
        const secBtn = document.createElement("button");
        secBtn.className = "section-btn";
        secBtn.type = "button";
        secBtn.innerHTML = `<span>${escapeHtml(sec.title || sec.key)}</span><span class="tiny-muted">${escapeHtml(sec.key || "")}</span>`;
        secBtn.onclick = () => {
          closeMenuPanel();
          // Ask specifically about this handbook + section
          const question = `Using the Parent Handbook "${hb.title}", section "${sec.title}" (${sec.key}), answer this question: What does it say about this section?`;
          askApi(question);
        };
        sectionsWrap.appendChild(secBtn);
      });
    }

    const actions = document.createElement("div");
    actions.className = "handbook-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "secondary-btn small";
    toggleBtn.type = "button";
    toggleBtn.textContent = "View sections";
    toggleBtn.onclick = () => {
      const isHidden = sectionsWrap.classList.contains("hidden");
      document.querySelectorAll(".sections-wrap").forEach((el) => el.classList.add("hidden"));
      document.querySelectorAll(".handbook-actions .secondary-btn.small").forEach((b) => (b.textContent = "View sections"));
      if (isHidden) {
        sectionsWrap.classList.remove("hidden");
        toggleBtn.textContent = "Hide sections";
      } else {
        sectionsWrap.classList.add("hidden");
        toggleBtn.textContent = "View sections";
      }
    };

    const openLinkBtn = document.createElement("button");
    openLinkBtn.className = "primary-btn small";
    openLinkBtn.type = "button";
    openLinkBtn.textContent = "Ask about this handbook";
    openLinkBtn.onclick = () => {
      closeMenuPanel();
      askApi(`Using the Parent Handbook "${hb.title}", answer this question: ${campus} parent handbook summary and key rules.`);
    };

    actions.appendChild(toggleBtn);
    actions.appendChild(openLinkBtn);

    card.appendChild(top);
    card.appendChild(actions);
    card.appendChild(sectionsWrap);

    list.appendChild(card);
  });

  menuPanelBody.appendChild(list);

  // helper examples
  const examples = document.createElement("div");
  examples.className = "handbook-examples";
  examples.innerHTML = `
    <div class="muted" style="margin-top:12px;">
      Examples to ask:<br>
      • What does the handbook say about arrival and dismissal?<br>
      • What is the late pickup policy?<br>
      • What does it say about medication?
    </div>
  `;
  menuPanelBody.appendChild(examples);
}

// ============================
// CHAT / API
// ============================
async function askApi(question) {
  if (!isTokenActive()) {
    addMessage("assistant", "Session expired. Please login again.");
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

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ query: trimmed, campus })
    });

    hideTyping();

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      addMessage("assistant", escapeHtml(data.error || "Unauthorized. Please login again."));
      localStorage.removeItem(LS.token);
      localStorage.removeItem(LS.until);
      localStorage.removeItem(LS.userRole);
      clearAdminSession();
      showLoginUI();
      return;
    }

    if (res.status === 429) {
      addMessage("assistant", "Too many requests. Please wait and try again.");
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

    addMessage("assistant", `<b>${escapeHtml(title)}</b><br><br>${escapeHtml(answer)}${linkPart}`);
  } catch {
    hideTyping();
    addMessage("assistant", "Error connecting to server.");
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  userInput.value = "";
  askApi(q);
});

// ============================
// INIT
// ============================
(function init() {
  ensureTopMenuBar();

  // Clean expired tokens
  if (!isTokenActive()) {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.until);
    localStorage.removeItem(LS.userRole);
  }
  if (!isAdminActive()) clearAdminSession();

  // default campus blank if none saved
  if (!getCampus()) setCampus("");

  if (isTokenActive()) {
    showChatUI();
    clearChat();

    applyRoleToUI();

    addMessage(
      "assistant",
      `Welcome back 👋<br>
       Signed in as <b>${escapeHtml(getUserRole().toUpperCase())}</b><br>
       <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>
       ${isParent() ? "You can ask about the <b>Parent Handbook</b> only." : "Ask any CMS policy, protocol, or handbook question."}`
    );

    // preload handbooks
    if (getCampus()) loadHandbooksForCampus(getCampus());
  } else {
    showLoginUI();
  }

  // Make campus selects reflect stored value
  setCampus(getCampus());
})();
