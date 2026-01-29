// ============================
// CMS Policy Chatbot - app.js (UPDATED)
// - Staff/Parent login on same page
// - Admin login (PIN) from login page too
// - Parent role: only Parent Handbook menu visible
// - Admin-only can still browse handbook list/sections (no asking AI)
// - Handbook menu shows list by campus -> click handbook -> click section -> show content
// - Campus required on login (blank default)
// - "Campus switched" message in chat
// ============================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const PARENT_AUTH_URL = `${WORKER_BASE}/auth/parent`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;
const HANDBOOK_LIST_URL = `${WORKER_BASE}/handbooks/list`;
const HANDBOOK_SECTION_URL = `${WORKER_BASE}/handbooks/section`;

const LS = {
  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",

  parentToken: "cms_parent_token",
  parentUntil: "cms_parent_until",

  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until",

  campus: "cms_selected_campus"
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

// ===== DOM (base) =====
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

// menu panel stuff
const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

// optional elements
const campusSelect = document.getElementById("campus-select"); // login select
const campusSwitch = document.getElementById("campus-switch"); // header select
const adminModeBtn = document.getElementById("admin-mode-btn"); // header (toggle)
const modeBadge = document.getElementById("mode-badge");

// login-page admin button (optional, in index)
const loginAdminBtn = document.getElementById("login-admin-btn"); // button on login page (if exists)
const adminModal = document.getElementById("admin-modal");
const adminPinInput = document.getElementById("admin-pin");
const adminPinSubmit = document.getElementById("admin-pin-submit");
const adminPinCancel = document.getElementById("admin-pin-cancel");

const adminLinks = document.getElementById("admin-links");

// ensure top menu exists
let topMenuBar = document.getElementById("top-menu-bar");
let menuPills = document.querySelectorAll(".menu-pill");

// typing
let typingBubble = null;

// handbook cache
let handbookCacheByCampus = {}; // { "YC": [ {id,title,program,sections:[{key,title}]} ] }

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

function setBannerRole(role) {
  // role badge in header
  if (!modeBadge) return;
  modeBadge.classList.remove("admin");
  modeBadge.textContent = (role || "STAFF").toUpperCase();
  if (role === "admin") modeBadge.classList.add("admin");
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

function tokenActive(tokenKey, untilKey) {
  const token = localStorage.getItem(tokenKey);
  const until = Number(localStorage.getItem(untilKey) || "0");
  return !!token && Date.now() < until;
}

function isStaffActive() {
  return tokenActive(LS.staffToken, LS.staffUntil);
}
function isParentActive() {
  return tokenActive(LS.parentToken, LS.parentUntil);
}
function isAdminActive() {
  return tokenActive(LS.adminToken, LS.adminUntil);
}

function getStaffToken() {
  return localStorage.getItem(LS.staffToken) || "";
}
function getParentToken() {
  return localStorage.getItem(LS.parentToken) || "";
}
function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
}

function getAnyTokenForHandbooks() {
  // for handbook endpoints: staff/parent/admin are allowed
  if (isStaffActive()) return getStaffToken();
  if (isParentActive()) return getParentToken();
  if (isAdminActive()) return getAdminToken();
  return "";
}

function getChatToken() {
  // /api only supports staff or parent
  if (isStaffActive()) return getStaffToken();
  if (isParentActive()) return getParentToken();
  return "";
}

function getCurrentRole() {
  // for UI
  if (isAdminActive() && !isStaffActive() && !isParentActive()) return "admin";
  if (isParentActive() && !isStaffActive()) return "parent";
  if (isStaffActive()) return "staff";
  if (isAdminActive()) return "admin";
  return "staff";
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

// ============================
// TOP MENU (Ensure it exists + visible)
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

  menuPanelClose && (menuPanelClose.onclick = closeMenuPanel);
  menuOverlay && (menuOverlay.onclick = closeMenuPanel);
}

function forceShowTopMenu() {
  if (!topMenuBar) return;
  topMenuBar.classList.remove("hidden");
  topMenuBar.style.display = "block";
  topMenuBar.style.visibility = "visible";
  topMenuBar.style.opacity = "1";
}

function applyRoleVisibility() {
  // Parent: hide policies/protocols pills, show handbook only
  const role = getCurrentRole();

  const policiesBtn = document.querySelector('.menu-pill[data-menu="policies"]');
  const protocolsBtn = document.querySelector('.menu-pill[data-menu="protocols"]');
  const handbookBtn = document.querySelector('.menu-pill[data-menu="handbook"]');

  const isParent = role === "parent" && !isStaffActive();
  const isAdminOnly = role === "admin" && !isStaffActive() && !isParentActive();

  // Parents and Admin-only: can still see handbook
  if (handbookBtn) handbookBtn.style.display = "inline-flex";

  // Parent or Admin-only: hide policies/protocols
  if (policiesBtn) policiesBtn.style.display = (isParent || isAdminOnly) ? "none" : "inline-flex";
  if (protocolsBtn) protocolsBtn.style.display = (isParent || isAdminOnly) ? "none" : "inline-flex";

  // Admin links only if admin token is active
  if (adminLinks) {
    if (isAdminActive()) adminLinks.classList.remove("hidden");
    else adminLinks.classList.add("hidden");
  }

  // badge
  setBannerRole(role);
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

  setBannerRole("staff");
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
// LOGIN (Staff/Parent)
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

  // Try STAFF first; if invalid -> try PARENT (so one input works for both)
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
    let staffAttempt = await tryAuth(STAFF_AUTH_URL);

    if (staffAttempt.res.ok && staffAttempt.data?.ok) {
      // staff success
      localStorage.setItem(LS.staffToken, staffAttempt.data.token);
      localStorage.setItem(LS.staffUntil, String(Date.now() + (staffAttempt.data.expires_in || 28800) * 1000));
      clearParentSession(); // ensure not parent at same time

      setCampus(selectedCampus);
      if (accessCodeInput) accessCodeInput.value = "";

      showChatUI();
      clearChat();

      addMessage(
        "assistant",
        `Hi 👋 You’re signed in.<br>
         <b>Role: STAFF</b><br>
         <b>Campus: ${escapeHtml(getCampus())}</b><br><br>
         Ask about any policy, protocol, or the parent handbook for this campus.`
      );
      return;
    }

    // not staff -> try parent
    let parentAttempt = await tryAuth(PARENT_AUTH_URL);

    if (parentAttempt.res.ok && parentAttempt.data?.ok) {
      localStorage.setItem(LS.parentToken, parentAttempt.data.token);
      localStorage.setItem(LS.parentUntil, String(Date.now() + (parentAttempt.data.expires_in || 28800) * 1000));
      clearStaffSession(); // ensure not staff at same time

      setCampus(selectedCampus);
      if (accessCodeInput) accessCodeInput.value = "";

      showChatUI();
      clearChat();

      addMessage(
        "assistant",
        `Hi 👋 You’re signed in.<br>
         <b>Role: PARENT</b><br>
         <b>Campus: ${escapeHtml(getCampus())}</b><br><br>
         You can view the <b>Parent Handbook</b> for this campus.`
      );
      return;
    }

    // both failed
    if (loginError) {
      const err = staffAttempt.data?.error || parentAttempt.data?.error || "Invalid code.";
      loginError.textContent = err;
    }
  } catch {
    if (loginError) loginError.textContent = "Could not connect to server.";
  }
});

// ============================
// LOGIN ADMIN (PIN) - from login page button
// ============================
async function enterAdminMode(pin) {
  const p = String(pin || "").trim();
  if (!p) return { ok: false, error: "Missing PIN" };

  const res = await fetch(ADMIN_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: p })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return { ok: false, error: data.error || "Invalid PIN" };

  localStorage.setItem(LS.adminToken, data.token);
  localStorage.setItem(LS.adminUntil, String(Date.now() + (data.expires_in || 28800) * 1000));
  return { ok: true };
}

function showAdminPinModal(onSubmit) {
  if (adminModal && adminPinInput && adminPinSubmit && adminPinCancel) {
    adminPinInput.value = "";
    adminModal.classList.remove("hidden");
    adminPinInput.focus();

    adminPinCancel.onclick = () => adminModal.classList.add("hidden");
    adminPinSubmit.onclick = async () => {
      const pin = adminPinInput.value.trim();
      adminModal.classList.add("hidden");
      await onSubmit(pin);
    };
    return true;
  }
  return false;
}

loginAdminBtn?.addEventListener("click", async () => {
  if (loginError) loginError.textContent = "";

  const selectedCampus = campusSelect ? normalizeCampus(campusSelect.value) : getCampus();
  if (!selectedCampus) {
    if (loginError) loginError.textContent = "Please select a campus first (for handbook browsing).";
    return;
  }
  setCampus(selectedCampus);

  const usedModal = showAdminPinModal(async (pin) => {
    try {
      const r = await enterAdminMode(pin);
      if (!r.ok) {
        if (loginError) loginError.textContent = r.error || "Admin login failed.";
        return;
      }
      showChatUI();
      clearChat();
      addMessage(
        "assistant",
        `✅ Admin mode enabled.<br>
         <b>Campus: ${escapeHtml(getCampus())}</b><br><br>
         You can open <b>Parent Handbook</b> and browse handbooks/sections.<br>
         To ask questions in chat, login with a Staff or Parent code.`
      );
      applyRoleVisibility();
    } catch {
      if (loginError) loginError.textContent = "Admin login failed (network).";
    }
  });

  if (!usedModal) {
    const pin = prompt("Enter Admin PIN:");
    if (!pin) return;
    try {
      const r = await enterAdminMode(pin);
      if (!r.ok) {
        if (loginError) loginError.textContent = r.error || "Admin login failed.";
        return;
      }
      showChatUI();
      clearChat();
      addMessage(
        "assistant",
        `✅ Admin mode enabled.<br>
         <b>Campus: ${escapeHtml(getCampus())}</b><br><br>
         You can open <b>Parent Handbook</b> and browse handbooks/sections.<br>
         To ask questions in chat, login with a Staff or Parent code.`
      );
      applyRoleVisibility();
    } catch {
      if (loginError) loginError.textContent = "Admin login failed (network).";
    }
  }
});

// ============================
// ADMIN MODE (header toggle button)
// ============================
adminModeBtn?.addEventListener("click", async () => {
  // Toggle off
  if (isAdminActive()) {
    clearAdminSession();
    applyRoleVisibility();
    addMessage("assistant", "Admin mode disabled.");
    return;
  }

  // Toggle on
  const usedModal = showAdminPinModal(async (pin) => {
    try {
      const r = await enterAdminMode(pin);
      if (!r.ok) {
        addMessage("assistant", `Admin PIN error: ${escapeHtml(r.error || "Invalid PIN")}`);
        return;
      }
      applyRoleVisibility();
      addMessage("assistant", "✅ Admin mode enabled (8 hours).");
    } catch {
      addMessage("assistant", "Admin login failed (network).");
    }
  });

  if (!usedModal) {
    const pin = prompt("Enter Admin PIN:");
    if (pin) {
      try {
        const r = await enterAdminMode(pin);
        if (!r.ok) addMessage("assistant", `Admin PIN error: ${escapeHtml(r.error || "Invalid PIN")}`);
        else {
          applyRoleVisibility();
          addMessage("assistant", "✅ Admin mode enabled (8 hours).");
        }
      } catch {
        addMessage("assistant", "Admin login failed (network).");
      }
    }
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
  if (loginError) loginError.textContent = "";

  // Reset campus selection to blank on login screen
  setCampus("");

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

  // if handbook panel open, refresh it
  if (menuPanel && !menuPanel.classList.contains("hidden")) {
    const active = document.querySelector(".menu-pill.active")?.dataset?.menu;
    if (active === "handbook") openMenuPanel("handbook");
  }
});

// ============================
// HANDBOOK UI HELPERS
// ============================
async function fetchHandbookListForCampus(campus) {
  const c = normalizeCampus(campus);
  if (!c) return [];

  if (handbookCacheByCampus[c]) return handbookCacheByCampus[c];

  const token = getAnyTokenForHandbooks();
  if (!token) throw new Error("not_logged_in");

  const res = await fetch(`${HANDBOOK_LIST_URL}?campus=${encodeURIComponent(c)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "handbook_list_failed");

  handbookCacheByCampus[c] = Array.isArray(data.handbooks) ? data.handbooks : [];
  return handbookCacheByCampus[c];
}

async function fetchHandbookSection(campus, handbookId, sectionKey) {
  const token = getAnyTokenForHandbooks();
  if (!token) throw new Error("not_logged_in");

  const u = new URL(HANDBOOK_SECTION_URL);
  u.searchParams.set("campus", normalizeCampus(campus));
  u.searchParams.set("handbook_id", handbookId);
  u.searchParams.set("section_key", sectionKey);

  const res = await fetch(String(u), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "handbook_section_failed");
  return data;
}

function renderHandbookList(handbooks, campus) {
  // Accordion style: handbook -> sections
  const wrapper = document.createElement("div");
  wrapper.className = "hb-list";

  if (!handbooks.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = `No handbooks found for campus ${campus}.`;
    wrapper.appendChild(empty);
    return wrapper;
  }

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

    const secWrap = document.createElement("div");
    secWrap.className = "hb-sections hidden";

    const secs = Array.isArray(hb.sections) ? hb.sections : [];
    if (!secs.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No sections found.";
      secWrap.appendChild(p);
    } else {
      secs.forEach((s) => {
        const secBtn = document.createElement("button");
        secBtn.type = "button";
        secBtn.className = "hb-section-btn";
        secBtn.textContent = s.title ? s.title : s.key;

        secBtn.onclick = async () => {
          closeMenuPanel();
          try {
            addMessage("assistant", `📖 <b>${escapeHtml(hb.title || "Handbook")}</b><br>Opening section: <b>${escapeHtml(s.title || s.key)}</b>...`);
            const data = await fetchHandbookSection(getCampus(), hb.id, s.key);

            const content = (data?.section?.content || "").trim();
            const link = data?.handbook?.link ? String(data.handbook.link) : "";

            const linkPart = link
              ? `<br><br><a href="${escapeHtml(link)}" target="_blank" rel="noopener">Open full handbook</a>`
              : "";

            addMessage(
              "assistant",
              `<b>${escapeHtml(data?.handbook?.title || hb.title || "Parent Handbook")}</b><br>
               <div class="muted">${escapeHtml(data?.section?.title || s.title || s.key)}</div>
               <br>${escapeHtml(content || "(No content)")}${linkPart}`
            );
          } catch (err) {
            const msg = String(err?.message || err);
            if (msg === "not_logged_in") {
              addMessage("assistant", "Not logged in. Please login with Staff/Parent code, or Admin PIN to browse.");
            } else {
              addMessage("assistant", `Could not load section: ${escapeHtml(msg)}`);
            }
          }
        };

        secWrap.appendChild(secBtn);
      });
    }

    hbHeader.onclick = () => {
      const isOpen = !secWrap.classList.contains("hidden");
      // close others
      wrapper.querySelectorAll(".hb-sections").forEach((el) => el.classList.add("hidden"));
      if (!isOpen) secWrap.classList.remove("hidden");
      else secWrap.classList.add("hidden");
    };

    hbCard.appendChild(hbHeader);
    hbCard.appendChild(secWrap);
    wrapper.appendChild(hbCard);
  });

  return wrapper;
}

// ============================
// MENU PANEL
// ============================
async function openMenuPanel(type) {
  if (!menuPanel || !menuPanelBody || !menuPanelTitle) return;

  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbook";

  menuPanelBody.innerHTML = "";

  const campus = getCampus();

  if (type === "handbook") {
    const p = document.createElement("p");
    p.innerHTML = `
      <b>Parent Handbook (Campus-based)</b><br>
      Current campus: <b>${escapeHtml(campus || "(not selected)")}</b><br><br>
      Select a handbook to view sections:
    `;
    p.style.fontSize = "0.92rem";
    p.style.color = "#374151";
    menuPanelBody.appendChild(p);

    if (!campus) {
      const warn = document.createElement("div");
      warn.className = "muted";
      warn.textContent = "Please select a campus first.";
      menuPanelBody.appendChild(warn);
    } else {
      try {
        const list = await fetchHandbookListForCampus(campus);
        menuPanelBody.appendChild(renderHandbookList(list, campus));
      } catch (err) {
        const msg = String(err?.message || err);
        const warn = document.createElement("div");
        warn.className = "muted";
        warn.style.color = "#b91c1c";
        warn.textContent =
          msg === "not_logged_in"
            ? "Not logged in. (Admin can browse if PIN logged in.)"
            : `Could not load handbooks: ${msg}`;
        menuPanelBody.appendChild(warn);
      }
    }

    menuPanel.classList.remove("hidden");
    if (menuOverlay) menuOverlay.classList.remove("hidden");
    return;
  }

  // Parent or Admin-only should not see policies/protocols UI
  const role = getCurrentRole();
  const isParent = role === "parent" && !isStaffActive();
  const isAdminOnly = role === "admin" && !isStaffActive() && !isParentActive();
  if ((isParent || isAdminOnly) && (type === "policies" || type === "protocols")) {
    const warn = document.createElement("p");
    warn.className = "muted";
    warn.textContent = "Not available for this role.";
    menuPanelBody.appendChild(warn);
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
// CHAT / API
// ============================
async function askPolicy(question) {
  // /api only staff/parent
  if (!isStaffActive() && !isParentActive()) {
    addMessage("assistant", "If you want to ask questions in chat, please login with a Staff or Parent code. (Admin-only is for dashboard/logs + handbook browsing.)");
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
    const token = getChatToken();

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

    if (!res.ok || !data.ok) {
      addMessage("assistant", escapeHtml(data.error || "Network error — please try again."));
      return;
    }

    // show answer
    const title = data?.source?.title || "Answer:";
    const answer = data?.answer || "";

    const link = data?.source?.link || "";
    const linkPart = link
      ? `<br><br><a href="${escapeHtml(link)}" target="_blank" rel="noopener">Open full document</a>`
      : "";

    // If handbook section was detected, show it
    const hb = data?.handbook_section;
    const hbPart = hb?.section_title
      ? `<div class="muted">Handbook section: ${escapeHtml(hb.section_title)} (${escapeHtml(hb.section_key || "")})</div><br>`
      : "";

    addMessage("assistant", `<b>${escapeHtml(title)}</b><br>${hbPart}${escapeHtml(answer)}${linkPart}`);
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
  if (!isStaffActive()) clearStaffSession();
  if (!isParentActive()) clearParentSession();
  if (!isAdminActive()) clearAdminSession();

  // Default campus blank
  if (!getCampus()) setCampus("");

  // Decide initial screen
  if (isStaffActive() || isParentActive() || isAdminActive()) {
    showChatUI();
    clearChat();

    const role = getCurrentRole();

    if (role === "staff") {
      addMessage(
        "assistant",
        `Welcome back 👋<br>
         <b>Role: STAFF</b><br>
         <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>
         Ask any CMS policy, protocol, or handbook question.`
      );
    } else if (role === "parent") {
      addMessage(
        "assistant",
        `Welcome back 👋<br>
         <b>Role: PARENT</b><br>
         <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>
         Open <b>Parent Handbook</b> to browse handbooks and sections.`
      );
    } else {
      addMessage(
        "assistant",
        `✅ Admin mode enabled.<br>
         <b>Campus: ${escapeHtml(getCampus() || "(not selected)")}</b><br><br>
         You can browse <b>Parent Handbook</b> and access <b>Dashboard/Logs</b>.<br>
         To ask questions in chat, login with a Staff or Parent code.`
      );
    }

    applyRoleVisibility();
  } else {
    showLoginUI();
  }
})();