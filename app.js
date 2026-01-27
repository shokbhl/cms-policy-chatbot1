// ============================
// CMS Policy Chatbot - app.js (FINAL)
// Works with Worker endpoints:
//  POST /auth/staff  { code }  -> { ok, token, expires_in }
//  POST /auth/admin  { pin }   -> { ok, token, expires_in }
//  POST /api         { query, campus, role } with Bearer staff token
//  GET  /admin/logs  (Bearer admin token)
//  GET  /admin/stats (Bearer admin token)
// ============================

// ===== CONFIG =====
const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;

// ===== LocalStorage keys =====
const LS = {
  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",
  campus: "cms_selected_campus",
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

// ===== MENU ITEMS =====
// NOTE: handbook is "campus-based" via KV, so we don't list items here.
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
  ],
  handbook: []
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

const topMenuBar = document.getElementById("top-menu-bar");
const menuPills = document.querySelectorAll(".menu-pill");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

// Optional elements
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

// ============================
// HELPERS - UI
// ============================
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

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  if (headerActions) headerActions.classList.add("hidden");
  if (topMenuBar) topMenuBar.classList.add("hidden");

  setModeStaff(); // reset visuals
}

function showChatUI() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  if (headerActions) headerActions.classList.remove("hidden");
  if (topMenuBar) topMenuBar.classList.remove("hidden");
}

// ============================
// HELPERS - Session / Campus
// ============================
function setCampus(code) {
  const c = (code || "MC").trim().toUpperCase();
  localStorage.setItem(LS.campus, c);

  if (campusSelect) campusSelect.value = c;
  if (campusSwitch) campusSwitch.value = c;
}

function getCampus() {
  return (localStorage.getItem(LS.campus) || "MC").trim().toUpperCase();
}

function isStaffActive() {
  const token = localStorage.getItem(LS.staffToken);
  const until = Number(localStorage.getItem(LS.staffUntil) || "0");
  return !!token && Date.now() < until;
}

function getStaffToken() {
  return localStorage.getItem(LS.staffToken) || "";
}

function isAdminActive() {
  const token = localStorage.getItem(LS.adminToken);
  const until = Number(localStorage.getItem(LS.adminUntil) || "0");
  return !!token && Date.now() < until;
}

function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
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
// LOGIN (Staff token via Worker)
// ============================
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (loginError) loginError.textContent = "";

  const code = (accessCodeInput?.value || "").trim();
  const campus = campusSelect ? campusSelect.value : getCampus();

  if (!code) {
    if (loginError) loginError.textContent = "Please enter access code.";
    return;
  }

  try {
    const res = await fetch(STAFF_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      if (loginError) loginError.textContent = data.error || "Invalid code.";
      return;
    }

    // Save staff session
    localStorage.setItem(LS.staffToken, data.token);
    localStorage.setItem(
      LS.staffUntil,
      String(Date.now() + (data.expires_in || 28800) * 1000)
    );

    setCampus(campus);
    if (accessCodeInput) accessCodeInput.value = "";

    showChatUI();
    clearChat();

    // restore admin view if still active
    if (isAdminActive()) setModeAdmin();
    else setModeStaff();

    addMessage(
      "assistant",
      `Hi 👋 You’re signed in.<br>
       <b>Campus: ${escapeHtml(getCampus())}</b><br><br>
       Ask about any policy, protocol, or the parent handbook for this campus.`
    );
  } catch (err) {
    if (loginError) loginError.textContent = "Could not connect to server.";
  }
});

// ============================
// LOGOUT
// ============================
logoutBtn?.addEventListener("click", () => {
  closeMenuPanel();
  clearChat();

  localStorage.removeItem(LS.staffToken);
  localStorage.removeItem(LS.staffUntil);
  clearAdminSession();

  if (accessCodeInput) accessCodeInput.value = "";
  if (loginError) loginError.textContent = "";

  showLoginUI();
});

// ============================
// CAMPUS SWITCH (header)
// ============================
campusSelect?.addEventListener("change", () => setCampus(campusSelect.value));

campusSwitch?.addEventListener("change", () => {
  setCampus(campusSwitch.value);
  addMessage("assistant", `Campus switched to <b>${escapeHtml(getCampus())}</b>.`);
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
    localStorage.setItem(
      LS.adminUntil,
      String(Date.now() + (data.expires_in || 28800) * 1000)
    );

    setModeAdmin();
    addMessage("assistant", "✅ Admin mode enabled (8 hours).");
  } catch (e) {
    addMessage("assistant", "Admin login failed (network).");
  }
}

adminModeBtn?.addEventListener("click", () => {
  // If admin already active -> disable it
  if (isAdminActive()) {
    clearAdminSession();
    setModeStaff();
    addMessage("assistant", "Admin mode disabled.");
    return;
  }

  // Prefer modal if exists
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

  // Fallback prompt
  const pin = prompt("Enter Admin PIN:");
  if (pin) enterAdminMode(pin);
});

// ============================
// MENU PANEL
// ============================
function openMenuPanel(type) {
  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbook";

  menuPanelBody.innerHTML = "";

  const items = MENU_ITEMS[type];

  // Handbook: do NOT auto-ask anything. Just show instructions.
  if (type === "handbook") {
    const p = document.createElement("p");
    p.innerHTML = `
      <b>Parent Handbook (Campus-based)</b><br><br>
      Ask a handbook question in chat, for example:<br>
      • “What does the handbook say about arrival and dismissal?”<br>
      • “What is the late pickup policy?”<br>
      • “What does it say about medication?”<br><br>
      Current campus: <b>${escapeHtml(getCampus())}</b>
    `;
    p.style.fontSize = "0.92rem";
    p.style.color = "#374151";
    menuPanelBody.appendChild(p);

    menuPanel.classList.remove("hidden");
    menuOverlay.classList.remove("hidden");
    return;
  }

  if (!items || items.length === 0) {
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
        askPolicy(qPrefix + item.label, true);
      });

      menuPanelBody.appendChild(btn);
    });
  }

  menuPanel.classList.remove("hidden");
  menuOverlay.classList.remove("hidden");
}

function closeMenuPanel() {
  menuPanel?.classList.add("hidden");
  menuOverlay?.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

menuPills.forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.menu;
    if (btn.classList.contains("active")) closeMenuPanel();
    else openMenuPanel(type);
  });
});

menuPanelClose?.addEventListener("click", closeMenuPanel);
menuOverlay?.addEventListener("click", closeMenuPanel);

// ============================
// CHAT / API
// ============================
async function askPolicy(question) {
  if (!isStaffActive()) {
    addMessage("assistant", "Session expired. Please login again.");
    showLoginUI();
    return;
  }

  const trimmed = String(question || "").trim();
  if (!trimmed) return;

  const campus = getCampus();
  const role = isAdminActive() ? "admin" : "staff";

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getStaffToken()}`
      },
      body: JSON.stringify({ query: trimmed, campus, role })
    });

    hideTyping();

    // Rate limit
    if (res.status === 429) {
      addMessage("assistant", "Too many requests. Please wait a moment and try again.");
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      addMessage("assistant", escapeHtml(data.error || "Unauthorized. Please login again."));
      // force logout UI
      localStorage.removeItem(LS.staffToken);
      localStorage.removeItem(LS.staffUntil);
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
  } catch (err) {
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
  setCampus(getCampus());

  // If tokens expired, clean them
  if (!isStaffActive()) {
    localStorage.removeItem(LS.staffToken);
    localStorage.removeItem(LS.staffUntil);
  }
  if (!isAdminActive()) clearAdminSession();

  if (isStaffActive()) {
    showChatUI();
    clearChat();

    if (isAdminActive()) setModeAdmin();
    else setModeStaff();

    addMessage(
      "assistant",
      `Welcome back 👋<br>
       <b>Campus: ${escapeHtml(getCampus())}</b><br><br>
       Ask any CMS policy, protocol, or handbook question.`
    );
  } else {
    showLoginUI();
  }
})();
