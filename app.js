// ============================
// CMS Policy Chatbot - app.js (ALL-IN-ONE)
// - Login: Staff / Parent / Admin from same login screen
// - Campus is required (blank default)
// - Parent sees ONLY handbook UI (no policies/protocols)
// - Handbook menu: shows campus handbooks list -> expand sections -> click section to load content
// - Admin quick links shown when admin token active
// ============================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;

const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const PARENT_AUTH_URL = `${WORKER_BASE}/auth/parent`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;

const HANDBOOK_LIST_URL = `${WORKER_BASE}/handbooks/list`;
const HANDBOOK_SECTION_URL = `${WORKER_BASE}/handbooks/section`;

const LS = {
  campus: "cms_selected_campus",

  // staff token
  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",

  // parent token
  parentToken: "cms_parent_token",
  parentUntil: "cms_parent_until",

  // admin token
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

const campusSelect = document.getElementById("campus-select"); // login select
const campusSwitch = document.getElementById("campus-switch"); // header select

const adminModeBtn = document.getElementById("admin-mode-btn");
const modeBadge = document.getElementById("mode-badge");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

let topMenuBar = document.getElementById("top-menu-bar");
let menuPills = document.querySelectorAll(".menu-pill");

let typingBubble = null;

// ============================
// Helpers
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
// Campus / Session
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

function getToken(tokenKey) {
  return localStorage.getItem(tokenKey) || "";
}

function clearSession(tokenKey, untilKey) {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(untilKey);
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

function getActiveUserRole() {
  // admin token means admin capabilities on top of staff/parent
  if (isParentActive()) return "parent";
  if (isStaffActive()) return "staff";
  return "";
}

function getActiveAuthTokenForApi() {
  // API requires staff OR parent token
  if (isParentActive()) return getToken(LS.parentToken);
  if (isStaffActive()) return getToken(LS.staffToken);
  return "";
}

function setModeBadge() {
  const role = getActiveUserRole();
  const admin = isAdminActive();

  if (!modeBadge) return;

  if (admin) {
    modeBadge.textContent = "ADMIN";
    modeBadge.classList.add("admin");
  } else if (role === "parent") {
    modeBadge.textContent = "PARENT";
    modeBadge.classList.remove("admin");
  } else {
    modeBadge.textContent = "STAFF";
    modeBadge.classList.remove("admin");
  }
}

function showAdminLinksIfNeeded() {
  const links = document.getElementById("admin-links");
  if (!links) return;
  if (isAdminActive()) links.classList.remove("hidden");
  else links.classList.add("hidden");
}

// ============================
// Top Menu ensure
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

function forceShowTopMenu() {
  if (!topMenuBar) return;
  topMenuBar.classList.remove("hidden");
  topMenuBar.style.display = "block";
  topMenuBar.style.visibility = "visible";
  topMenuBar.style.opacity = "1";
}

function applyRoleVisibility() {
  const role = getActiveUserRole();

  // Hide policies/protocols pills for parent
  const policiesBtn = document.querySelector('.menu-pill[data-menu="policies"]');
  const protocolsBtn = document.querySelector('.menu-pill[data-menu="protocols"]');

  if (role === "parent") {
    if (policiesBtn) policiesBtn.style.display = "none";
    if (protocolsBtn) protocolsBtn.style.display = "none";
  } else {
    if (policiesBtn) policiesBtn.style.display = "";
    if (protocolsBtn) protocolsBtn.style.display = "";
  }

  showAdminLinksIfNeeded();
  setModeBadge();
}

// ============================
// Screen toggles
// ============================
function showLoginUI() {
  closeMenuPanel();

  if (chatScreen) chatScreen.classList.add("hidden");
  if (loginScreen) loginScreen.classList.remove("hidden");

  if (headerActions) headerActions.classList.add("hidden");
  if (topMenuBar) topMenuBar.classList.add("hidden");

  setModeBadge();
  showAdminLinksIfNeeded();
}

function showChatUI() {
  if (loginScreen) loginScreen.classList.add("hidden");
  if (chatScreen) chatScreen.classList.remove("hidden");

  ensureTopMenuBar();

  if (headerActions) headerActions.classList.remove("hidden");
  forceShowTopMenu();

  applyRoleVisibility();
}

// ============================
// LOGIN (Staff/Parent/Admin from same page)
// ============================
async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function setSessionForRole(role, token, expiresInSec) {
  const until = String(Date.now() + (expiresInSec || 28800) * 1000);

  if (role === "staff") {
    localStorage.setItem(LS.staffToken, token);
    localStorage.setItem(LS.staffUntil, until);
  } else if (role === "parent") {
    localStorage.setItem(LS.parentToken, token);
    localStorage.setItem(LS.parentUntil, until);
  } else if (role === "admin") {
    localStorage.setItem(LS.adminToken, token);
    localStorage.setItem(LS.adminUntil, until);
  }
}

async function loginFlow(codeOrPin) {
  const campus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();
  if (!campus) {
    if (loginError) loginError.textContent = "Please select a campus.";
    return false;
  }

  const secret = String(codeOrPin || "").trim();
  if (!secret) {
    if (loginError) loginError.textContent = "Please enter code / pin.";
    return false;
  }

  // Try STAFF
  let r = await postJson(STAFF_AUTH_URL, { code: secret });
  if (r.res.ok && r.data?.ok) {
    setSessionForRole("staff", r.data.token, r.data.expires_in);
    setCampus(campus);
    return { ok: true, role: "staff" };
  }

  // Try PARENT
  r = await postJson(PARENT_AUTH_URL, { code: secret });
  if (r.res.ok && r.data?.ok) {
    setSessionForRole("parent", r.data.token, r.data.expires_in);
    setCampus(campus);
    return { ok: true, role: "parent" };
  }

  // Try ADMIN (pin)
  r = await postJson(ADMIN_AUTH_URL, { pin: secret });
  if (r.res.ok && r.data?.ok) {
    // Admin token alone does not allow /api. Admin should still use staff/parent for chat.
    // But user asked: "admin from start on first page" -> we will allow it:
    // - If admin enters, we enable admin token AND also ask them to enter staff code next if they want to chat.
    setSessionForRole("admin", r.data.token, r.data.expires_in);
    setCampus(campus);
    return { ok: true, role: "admin" };
  }

  // Fail
  const msg = r?.data?.error || "Invalid code / pin.";
  if (loginError) loginError.textContent = msg;
  return { ok: false };
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (loginError) loginError.textContent = "";

  const val = (accessCodeInput?.value || "").trim();
  const result = await loginFlow(val);

  if (!result?.ok) return;

  if (accessCodeInput) accessCodeInput.value = "";

  showChatUI();
  clearChat();

  applyRoleVisibility();

  const campus = getCampus();
  const role = result.role;

  if (role === "admin") {
    addMessage(
      "assistant",
      `✅ Admin mode enabled.<br><b>Campus: ${escapeHtml(campus)}</b><br><br>
       If you want to ask questions in chat, please login with a <b>Staff</b> or <b>Parent</b> code (admin token is for dashboard/logs).`
    );
  } else if (role === "parent") {
    addMessage(
      "assistant",
      `Hi 👋 You’re signed in as <b>PARENT</b>.<br><b>Campus: ${escapeHtml(campus)}</b><br><br>
       Tap <b>Parent Handbook</b> to browse handbooks & sections, or ask a handbook question.`
    );
  } else {
    addMessage(
      "assistant",
      `Hi 👋 You’re signed in as <b>STAFF</b>.<br><b>Campus: ${escapeHtml(campus)}</b><br><br>
       Ask about policies, protocols, or parent handbooks for this campus.`
    );
  }
});

// ============================
// LOGOUT
// ============================
logoutBtn?.addEventListener("click", () => {
  closeMenuPanel();
  clearChat();

  clearSession(LS.staffToken, LS.staffUntil);
  clearSession(LS.parentToken, LS.parentUntil);
  clearSession(LS.adminToken, LS.adminUntil);

  if (accessCodeInput) accessCodeInput.value = "";
  if (loginError) loginError.textContent = "";

  setCampus("");
  showLoginUI();
});

// ============================
// Campus Change
// ============================
campusSelect?.addEventListener("change", () => {
  const c = normalizeCampus(campusSelect.value);
  setCampus(c);
});

campusSwitch?.addEventListener("change", async () => {
  const c = normalizeCampus(campusSwitch.value);
  if (!c) return;
  setCampus(c);

  addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);

  // If handbook panel open, refresh the list for new campus
  const opened = menuPanel && !menuPanel.classList.contains("hidden");
  const activePill = document.querySelector(".menu-pill.active");
  if (opened && activePill?.dataset?.menu === "handbook") {
    await renderHandbookBrowser(); // refresh list
  }
});

// ============================
// Admin mode button (toggle)
// ============================
adminModeBtn?.addEventListener("click", async () => {
  if (isAdminActive()) {
    clearSession(LS.adminToken, LS.adminUntil);
    setModeBadge();
    showAdminLinksIfNeeded();
    addMessage("assistant", "Admin mode disabled.");
    return;
  }

  // Use prompt (simple)
  const pin = prompt("Enter Admin PIN:");
  if (!pin) return;

  const r = await postJson(ADMIN_AUTH_URL, { pin: String(pin).trim() });
  if (!r.res.ok || !r.data?.ok) {
    addMessage("assistant", `Admin PIN error: ${escapeHtml(r.data?.error || "Invalid PIN")}`);
    return;
  }

  setSessionForRole("admin", r.data.token, r.data.expires_in);
  setModeBadge();
  showAdminLinksIfNeeded();
  addMessage("assistant", "✅ Admin mode enabled (8 hours).");
});

// ============================
// Menu Panel (Policies/Protocols/Handbook)
// ============================
function openMenuPanel(type) {
  if (!menuPanel || !menuPanelBody || !menuPanelTitle) return;

  // prevent parent from opening policies/protocols
  const role = getActiveUserRole();
  if (role === "parent" && (type === "policies" || type === "protocols")) {
    addMessage("assistant", "Parent access: only Parent Handbook is available.");
    return;
  }

  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbook";

  menuPanelBody.innerHTML = "";

  if (type === "handbook") {
    renderHandbookBrowser();
    menuPanel.classList.remove("hidden");
    if (menuOverlay) menuOverlay.classList.remove("hidden");
    return;
  }

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
      btn.onclick = () => {
        closeMenuPanel();
        const qPrefix = type === "protocols" ? "Please show me the protocol: " : "Please show me the policy: ";
        askApi(qPrefix + item.label);
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
// Handbook Browser UI
// ============================
async function fetchHandbookList(campus) {
  const token = getActiveAuthTokenForApi();
  if (!token) return { ok: false, error: "Not logged in" };

  const res = await fetch(`${HANDBOOK_LIST_URL}?campus=${encodeURIComponent(campus)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return { ok: false, error: data.error || "Failed to load handbooks" };
  return data;
}

async function fetchHandbookSection(campus, handbookId, sectionKey) {
  const token = getActiveAuthTokenForApi();
  if (!token) return { ok: false, error: "Not logged in" };

  const qs = new URLSearchParams({
    campus,
    handbook_id: handbookId,
    section_key: sectionKey
  });

  const res = await fetch(`${HANDBOOK_SECTION_URL}?${qs.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return { ok: false, error: data.error || "Failed to load section" };
  return data;
}

function renderNote(text) {
  const p = document.createElement("p");
  p.style.fontSize = "0.92rem";
  p.style.color = "#374151";
  p.innerHTML = text;
  return p;
}

async function renderHandbookBrowser() {
  if (!menuPanelBody) return;

  const campus = getCampus();
  if (!campus) {
    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(renderNote(`<b>Please select a campus first.</b>`));
    return;
  }

  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(
    renderNote(
      `<b>Parent Handbook (Campus-based)</b><br>
       Current campus: <b>${escapeHtml(campus)}</b><br><br>
       Select a handbook to view sections:`
    )
  );

  const loading = document.createElement("div");
  loading.className = "mini-loading";
  loading.textContent = "Loading handbooks...";
  menuPanelBody.appendChild(loading);

  const listData = await fetchHandbookList(campus);
  loading.remove();

  if (!listData.ok) {
    menuPanelBody.appendChild(renderNote(`<span style="color:#b91c1c;">${escapeHtml(listData.error || "Error")}</span>`));
    return;
  }

  const handbooks = listData.handbooks || [];
  if (!handbooks.length) {
    menuPanelBody.appendChild(renderNote("No handbooks found for this campus yet."));
    return;
  }

  // Build accordion list
  const wrap = document.createElement("div");
  wrap.className = "hb-list";

  handbooks.forEach((hb) => {
    const hbCard = document.createElement("div");
    hbCard.className = "hb-card";

    const hbHeader = document.createElement("button");
    hbHeader.className = "hb-header";
    hbHeader.type = "button";
    hbHeader.innerHTML = `
      <div class="hb-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
      <div class="hb-sub">${escapeHtml(hb.program || "")}</div>
    `;

    const hbBody = document.createElement("div");
    hbBody.className = "hb-body hidden";

    const topRow = document.createElement("div");
    topRow.className = "hb-toprow";
    topRow.innerHTML = hb.link
      ? `<a class="hb-link" href="${escapeHtml(hb.link)}" target="_blank" rel="noopener">Open full handbook</a>`
      : `<span class="hb-muted">No link available</span>`;
    hbBody.appendChild(topRow);

    const sections = Array.isArray(hb.sections) ? hb.sections : [];
    if (!sections.length) {
      const none = document.createElement("div");
      none.className = "hb-muted";
      none.textContent = "No sections defined yet.";
      hbBody.appendChild(none);
    } else {
      const secList = document.createElement("div");
      secList.className = "hb-sections";

      sections.forEach((sec) => {
        const secBtn = document.createElement("button");
        secBtn.type = "button";
        secBtn.className = "hb-section-btn";
        secBtn.textContent = sec.title || sec.key;

        secBtn.onclick = async () => {
          closeMenuPanel();
          addMessage("assistant", `📘 <b>${escapeHtml(hb.title)}</b><br>Opening section: <b>${escapeHtml(sec.title || sec.key)}</b>…`);
          showTyping();

          const secData = await fetchHandbookSection(campus, hb.id, sec.key);
          hideTyping();

          if (!secData.ok) {
            addMessage("assistant", `❌ ${escapeHtml(secData.error || "Could not load section")}`);
            return;
          }

          const content = secData.section?.content || "";
          addMessage(
            "assistant",
            `<b>${escapeHtml(secData.handbook?.title || hb.title)}</b><br>
             <span style="color:#6b7280;">Section: ${escapeHtml(secData.section?.title || sec.key)}</span><br><br>
             ${escapeHtml(content)}`
          );
        };

        secList.appendChild(secBtn);
      });

      hbBody.appendChild(secList);
    }

    hbHeader.onclick = () => {
      // close others
      wrap.querySelectorAll(".hb-body").forEach((x) => {
        if (x !== hbBody) x.classList.add("hidden");
      });
      hbBody.classList.toggle("hidden");
    };

    hbCard.appendChild(hbHeader);
    hbCard.appendChild(hbBody);
    wrap.appendChild(hbCard);
  });

  menuPanelBody.appendChild(wrap);

  // Example hints
  menuPanelBody.appendChild(
    renderNote(
      `<br>Or ask in chat, e.g.:<br>
       • “What does the handbook say about arrival and dismissal?”<br>
       • “What is the late pickup policy?”<br>
       • “What does it say about medication?”`
    )
  );
}

// ============================
// Chat / API
// ============================
async function askApi(question) {
  const role = getActiveUserRole();
  const token = getActiveAuthTokenForApi();

  if (!token) {
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
      clearSession(LS.staffToken, LS.staffUntil);
      clearSession(LS.parentToken, LS.parentUntil);
      // admin may remain
      showLoginUI();
      return;
    }

    if (!res.ok || !data.ok) {
      addMessage("assistant", escapeHtml(data.error || "Network error — please try again."));
      return;
    }

    const title = data.source?.title || "Answer:";
    const answer = data.answer || "";
    const link = data.source?.link;

    const linkPart = link
      ? `<br><br><a href="${escapeHtml(link)}" target="_blank" rel="noopener">Open full document</a>`
      : "";

    addMessage("assistant", `<b>${escapeHtml(title)}</b><br><br>${escapeHtml(answer)}${linkPart}`);

    // If parent asks non-handbook, the server already restricts docs; still ok.
    if (role === "parent" && data.source?.type && data.source.type !== "handbook") {
      addMessage("assistant", "Note: Parent access is limited to handbooks.");
    }
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
  askApi(q);
});

// ============================
// INIT
// ============================
(function init() {
  ensureTopMenuBar();

  // Clean expired tokens
  if (!isStaffActive()) clearSession(LS.staffToken, LS.staffUntil);
  if (!isParentActive()) clearSession(LS.parentToken, LS.parentUntil);
  if (!isAdminActive()) clearSession(LS.adminToken, LS.adminUntil);

  // default campus blank
  if (!getCampus()) setCampus("");

  const hasUser = isStaffActive() || isParentActive() || isAdminActive();

  if (hasUser && (isStaffActive() || isParentActive())) {
    showChatUI();
    clearChat();
    applyRoleVisibility();

    addMessage(
      "assistant",
      `Welcome back 👋<br>
       <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br>
       Mode: <b>${escapeHtml(isAdminActive() ? "ADMIN" : (getActiveUserRole() || "STAFF"))}</b><br><br>
       Ask any CMS policy, protocol, or handbook question.`
    );
  } else if (isAdminActive() && !isStaffActive() && !isParentActive()) {
    // Admin only session: show chat UI but warn about needing staff/parent token for /api
    showChatUI();
    clearChat();
    applyRoleVisibility();

    addMessage(
      "assistant",
      `✅ Admin mode is active.<br>
       <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>
       To use the chat, login with a Staff or Parent code (admin token is for dashboard/logs).`
    );
  } else {
    showLoginUI();
  }

  setModeBadge();
  showAdminLinksIfNeeded();
})();