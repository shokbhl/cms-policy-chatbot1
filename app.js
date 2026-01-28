// ============================
// CMS Policy Chatbot - app.js (FINAL)
// - Top menu always visible after login
// - Campus required (blank default)
// - Handbook list per campus + clickable sections
// - Admin Mode (PIN) 8 hours
// - Shows "Campus switched" message in chat
// Works with Worker:
//  POST /auth/staff, POST /auth/admin, POST /api
//  GET /handbooks?campus=YC   (NEW)
//  GET /admin/logs, GET /admin/stats
// ============================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;
const HANDBOOKS_URL = `${WORKER_BASE}/handbooks`; // GET ?campus=XX

const LS = {
  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",
  campus: "cms_selected_campus",
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

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

// menu bar
let topMenuBar = document.getElementById("top-menu-bar");
let menuPills = document.querySelectorAll(".menu-pill");

// typing
let typingBubble = null;

// ============================
// UI HELPERS
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
// TOP MENU (Ensure exists + bind)
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
        <button class="menu-pill" data-menu="handbook">Handbooks</button>
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

function showLoginUI() {
  closeMenuPanel();
  if (chatScreen) chatScreen.classList.add("hidden");
  if (loginScreen) loginScreen.classList.remove("hidden");

  if (headerActions) headerActions.classList.add("hidden");
  if (topMenuBar) topMenuBar.classList.add("hidden");

  setModeStaff();
}

function showChatUI() {
  if (loginScreen) loginScreen.classList.add("hidden");
  if (chatScreen) chatScreen.classList.remove("hidden");

  ensureTopMenuBar();

  if (headerActions) headerActions.classList.remove("hidden");
  if (topMenuBar) topMenuBar.classList.remove("hidden");
  topMenuBar.style.display = "block";
}

// ============================
// AUTH - STAFF LOGIN
// ============================
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (loginError) loginError.textContent = "";

  const code = (accessCodeInput?.value || "").trim();
  const selectedCampus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();

  if (!selectedCampus) {
    if (loginError) loginError.textContent = "Please select a campus.";
    return;
  }
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

    localStorage.setItem(LS.staffToken, data.token);
    localStorage.setItem(LS.staffUntil, String(Date.now() + (data.expires_in || 28800) * 1000));

    setCampus(selectedCampus);
    if (accessCodeInput) accessCodeInput.value = "";

    showChatUI();
    clearChat();

    if (isAdminActive()) setModeAdmin();
    else setModeStaff();

    addMessage(
      "assistant",
      `Hi 👋 You’re signed in.<br>
       <b>Campus: ${escapeHtml(getCampus())}</b><br><br>
       Use the top menu or ask a question below.`
    );
  } catch {
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

  setCampus(""); // back to blank default on login
  showLoginUI();
});

// ============================
// CAMPUS CHANGE
// ============================
campusSelect?.addEventListener("change", () => {
  const c = normalizeCampus(campusSelect.value);
  setCampus(c);
});

campusSwitch?.addEventListener("change", () => {
  const c = normalizeCampus(campusSwitch.value);
  if (!c) return;
  setCampus(c);
  addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);
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

    setModeAdmin();
    addMessage("assistant", "✅ Admin mode enabled (8 hours).");
  } catch {
    addMessage("assistant", "Admin login failed (network).");
  }
}

adminModeBtn?.addEventListener("click", () => {
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
// MENU PANEL
// ============================
function closeMenuPanel() {
  if (menuPanel) menuPanel.classList.add("hidden");
  if (menuOverlay) menuOverlay.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

// Fetch all handbooks for the campus (from worker)
async function fetchHandbooksForCampus(campus) {
  const url = `${HANDBOOKS_URL}?campus=${encodeURIComponent(campus)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getStaffToken()}`
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load handbooks");
  return Array.isArray(data.handbooks) ? data.handbooks : [];
}

function openMenuPanel(type) {
  if (!menuPanel || !menuPanelBody || !menuPanelTitle) return;

  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  menuPanelBody.innerHTML = "";
  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Handbooks";

  // ---- HANDBOOKS (dynamic per campus) ----
  if (type === "handbook") {
    const campus = getCampus();
    if (!campus) {
      const p = document.createElement("p");
      p.innerHTML = `Please select a campus first.`;
      p.style.color = "#6b7280";
      menuPanelBody.appendChild(p);
      menuPanel.classList.remove("hidden");
      menuOverlay?.classList.remove("hidden");
      return;
    }

    // loading
    const loading = document.createElement("p");
    loading.textContent = "Loading handbooks…";
    loading.style.color = "#6b7280";
    menuPanelBody.appendChild(loading);

    menuPanel.classList.remove("hidden");
    menuOverlay?.classList.remove("hidden");

    // async fill
    (async () => {
      try {
        const handbooks = await fetchHandbooksForCampus(campus);

        menuPanelBody.innerHTML = "";

        if (!handbooks.length) {
          const p = document.createElement("p");
          p.textContent = `No handbooks found for campus ${campus}.`;
          p.style.color = "#6b7280";
          menuPanelBody.appendChild(p);
          return;
        }

        const label = document.createElement("div");
        label.className = "menu-group-label";
        label.textContent = `Campus: ${campus} — Select a handbook section`;
        menuPanelBody.appendChild(label);

        // Each handbook card
        handbooks.forEach((hb) => {
          const wrap = document.createElement("div");
          wrap.className = "hb-block";

          const hTitle = document.createElement("div");
          hTitle.className = "hb-title";
          hTitle.textContent = hb.title || hb.id || "Handbook";
          wrap.appendChild(hTitle);

          // sections
          const sections = Array.isArray(hb.sections) ? hb.sections : [];
          if (!sections.length) {
            const p = document.createElement("div");
            p.className = "hb-empty";
            p.textContent = "No sections found.";
            wrap.appendChild(p);
          } else {
            sections.forEach((s) => {
              const btn = document.createElement("button");
              btn.className = "menu-item-btn";
              btn.textContent = s.title || s.key || "Section";
              btn.onclick = () => {
                closeMenuPanel();

                // Ask with explicit metadata so worker can log handbook+section
                const question = `Handbook: ${hb.title}\nSection: ${s.title}\n\nPlease summarize the rules and key points.`;
                askPolicy(question, {
                  handbook_id: hb.id,
                  section_key: s.key
                });
              };
              wrap.appendChild(btn);
            });
          }

          menuPanelBody.appendChild(wrap);
        });
      } catch (e) {
        menuPanelBody.innerHTML = "";
        const p = document.createElement("p");
        p.textContent = `Error loading handbooks: ${String(e.message || e)}`;
        p.style.color = "#b91c1c";
        menuPanelBody.appendChild(p);
      }
    })();

    return;
  }

  // ---- STATIC MENUS (policies/protocols) ----
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

  menuPanel.classList.remove("hidden");
  menuOverlay?.classList.remove("hidden");
}

// ============================
// CHAT / API
// ============================
async function askPolicy(question, meta = null) {
  if (!isStaffActive()) {
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

  const role = isAdminActive() ? "admin" : "staff";

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const payload = { query: trimmed, campus, role };

    // optional handbook meta (for logs + better matching)
    if (meta && typeof meta === "object") {
      if (meta.handbook_id) payload.handbook_id = String(meta.handbook_id);
      if (meta.section_key) payload.section_key = String(meta.section_key);
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getStaffToken()}`
      },
      body: JSON.stringify(payload)
    });

    hideTyping();

    if (res.status === 429) {
      addMessage("assistant", "Too many requests. Please wait a moment and try again.");
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      addMessage("assistant", escapeHtml(data.error || "Unauthorized. Please login again."));
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

  // Clean expired tokens
  if (!isStaffActive()) {
    localStorage.removeItem(LS.staffToken);
    localStorage.removeItem(LS.staffUntil);
  }
  if (!isAdminActive()) clearAdminSession();

  // default campus blank if none saved
  if (!getCampus()) setCampus("");

  if (isStaffActive()) {
    showChatUI();
    clearChat();

    if (isAdminActive()) setModeAdmin();
    else setModeStaff();

    addMessage(
      "assistant",
      `Welcome back 👋<br>
       <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>
       Use the menu above or ask a question.`
    );
  } else {
    showLoginUI();
  }
})();