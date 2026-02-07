// ============================
// CMS Policy Chatbot - app.js (BROWSE + SEARCH)
// - Policies / Protocols / Parent Handbook: full browser (docs -> sections -> section view)
// - Search chat: multi-results across categories (if shared topic)
// - Program filter affects handbook search + handbook browsing
// ============================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";

const API_URL = `${WORKER_BASE}/api`;
const STAFF_AUTH_URL = `${WORKER_BASE}/auth/staff`;
const PARENT_AUTH_URL = `${WORKER_BASE}/auth/parent`;
const ADMIN_AUTH_URL = `${WORKER_BASE}/auth/admin`;

const HANDBOOKS_URL = `${WORKER_BASE}/handbooks`;
const POLICIES_URL = `${WORKER_BASE}/policies`;
const PROTOCOLS_URL = `${WORKER_BASE}/protocols`;

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

const campusSelect = document.getElementById("campus-select"); // login
const campusSwitch = document.getElementById("campus-switch"); // header
const programSwitch = document.getElementById("program-switch"); // header

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

// caches
let handbookListCache = [];
let policiesListCache = [];
let protocolsListCache = [];

let handbookOpenId = null;
let policyOpenId = null;
let protocolOpenId = null;

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
// SESSION / CAMPUS / PROGRAM
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

function setProgram(p) {
  const v = String(p || "").trim() || "All Programs";
  localStorage.setItem(LS.program, v);
  if (programSwitch) programSwitch.value = v;
}

function getProgram() {
  return String(localStorage.getItem(LS.program) || "All Programs");
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

// Parent must ONLY see Parent Handbook
function applyRoleUI(role) {
  const isParent = role === "parent";
  const btnPolicies = document.querySelector('.menu-pill[data-menu="policies"]');
  const btnProtocols = document.querySelector('.menu-pill[data-menu="protocols"]');
  const btnHandbook = document.querySelector('.menu-pill[data-menu="handbook"]');

  if (btnPolicies) btnPolicies.style.display = isParent ? "none" : "";
  if (btnProtocols) btnProtocols.style.display = isParent ? "none" : "";
  if (btnHandbook) btnHandbook.style.display = ""; // always
  if (isParent) {
    const activeType = document.querySelector(".menu-pill.active")?.dataset?.menu;
    if (activeType === "policies" || activeType === "protocols") closeMenuPanel();
  }
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

  syncModeBadge();
  applyRoleUI(getActiveUserRole());
  syncHeaderSelections();
}

function syncHeaderSelections() {
  const c = getCampus();
  if (campusSwitch) campusSwitch.value = c || "";
  if (programSwitch) programSwitch.value = getProgram();
}

// ============================
// LOGIN
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
    if (!getProgram()) setProgram("All Programs");

    if (accessCodeInput) accessCodeInput.value = "";
    showChatUI();
    clearChat();

    syncModeBadge();
    applyRoleUI(role);

    addMessage(
      "assistant",
      role === "parent"
        ? `Hi 👋 You’re signed in as <b>Parent</b>.<br><b>Campus: ${escapeHtml(getCampus())}</b><br><br>You can browse the <b>Parent Handbook</b>.`
        : `Hi 👋 You’re signed in as <b>Staff</b>.<br><b>Campus: ${escapeHtml(getCampus())}</b><br><br>You can browse <b>Policies</b>, <b>Protocols</b>, and <b>Parent Handbook</b>, or search in chat.`
    );
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
  setProgram("All Programs");

  handbookListCache = [];
  policiesListCache = [];
  protocolsListCache = [];
  handbookOpenId = policyOpenId = protocolOpenId = null;

  showLoginUI();
});

// ============================
// CAMPUS / PROGRAM CHANGE
// ============================
campusSelect?.addEventListener("change", () => setCampus(normalizeCampus(campusSelect.value)));

campusSwitch?.addEventListener("change", async () => {
  const c = normalizeCampus(campusSwitch.value);
  if (!c) return;
  setCampus(c);

  handbookListCache = [];
  handbookOpenId = null;

  addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);

  const active = document.querySelector(".menu-pill.active")?.dataset?.menu;
  if (active) await openMenuPanel(active);
});

programSwitch?.addEventListener("change", async () => {
  setProgram(programSwitch.value);
  addMessage("assistant", `✅ Program set to <b>${escapeHtml(getProgram())}</b>.`);

  handbookListCache = [];
  handbookOpenId = null;

  const active = document.querySelector(".menu-pill.active")?.dataset?.menu;
  if (active === "handbook") await openMenuPanel("handbook");
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

  if (type === "handbook") await renderHandbookBrowser();
  if (type === "policies") await renderPoliciesBrowser();
  if (type === "protocols") await renderProtocolsBrowser();

  menuPanel.classList.remove("hidden");
  if (menuOverlay) menuOverlay.classList.remove("hidden");
}

function closeMenuPanel() {
  if (menuPanel) menuPanel.classList.add("hidden");
  if (menuOverlay) menuOverlay.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

// ============================
// BROWSE HELPERS
// ============================
async function apiGet(url) {
  const token = getAnyBearerToken();
  if (!token) throw new Error("Not logged in");

  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error || "Request failed");
  return data;
}

function renderSectionViewUI(opts) {
  const {
    headerTitle,
    metaLine,
    sectionTitle,
    sectionContent,
    link,
    onBack,
    onAsk,
    onSummary
  } = opts;

  menuPanelBody.innerHTML = `
    <div class="doc-wrap">
      <div class="doc-top">
        <div><b>${escapeHtml(headerTitle)}</b></div>
        <div class="doc-meta">${escapeHtml(metaLine || "")}</div>
      </div>

      <div class="doc-section-view">
        <div class="doc-section-head">
          <div class="doc-section-title">${escapeHtml(sectionTitle || "Section")}</div>
          <div class="doc-section-actions">
            <button class="mini-btn" id="doc-back">Back</button>
            ${link ? `<a class="mini-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">Open full document</a>` : ""}
          </div>
        </div>

        <div class="doc-section-content">${escapeHtml(sectionContent || "")}</div>

        <div class="doc-actions-row">
          <button class="primary-btn" id="doc-ask">Ask about this section</button>
          <button class="ghost-btn" id="doc-sum">AI Summary</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("doc-back")?.addEventListener("click", onBack);
  document.getElementById("doc-ask")?.addEventListener("click", onAsk);
  document.getElementById("doc-sum")?.addEventListener("click", onSummary);
}

// ============================
// HANDBOOK BROWSER
// ============================
async function renderHandbookBrowser() {
  const campus = getCampus();
  const program = getProgram();

  const wrap = document.createElement("div");
  wrap.className = "doc-wrap";

  wrap.innerHTML = `
    <div class="doc-top">
      <div><b>Parent Handbook (Campus-based)</b></div>
      <div class="doc-meta">Campus: <b>${escapeHtml(campus || "(not selected)")}</b> • Program: <b>${escapeHtml(program)}</b></div>
    </div>
    <div class="muted" id="doc-loading">Loading handbooks...</div>
  `;
  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(wrap);

  if (!campus) {
    wrap.querySelector("#doc-loading").textContent = "Please select a campus first.";
    return;
  }

  try {
    if (!handbookListCache.length) {
      const data = await apiGet(`${HANDBOOKS_URL}?campus=${encodeURIComponent(campus)}&program=${encodeURIComponent(program)}`);
      handbookListCache = data.handbooks || [];
    }

    const loading = wrap.querySelector("#doc-loading");
    if (loading) loading.remove();

    if (!handbookListCache.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No handbooks found for this campus/program yet.";
      wrap.appendChild(p);
      return;
    }

    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = "Select a handbook to view sections:";
    wrap.appendChild(label);

    handbookListCache.forEach((hb) => {
      const hbBtn = document.createElement("button");
      hbBtn.className = "doc-btn";
      hbBtn.innerHTML = `
        <div class="doc-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
        <div class="doc-sub">${escapeHtml(hb.program || "")}</div>
      `;

      const isOpen = handbookOpenId === hb.id;

      hbBtn.onclick = async () => {
        handbookOpenId = isOpen ? null : hb.id;
        await openMenuPanel("handbook");
      };

      wrap.appendChild(hbBtn);

      if (isOpen) {
        const secWrap = document.createElement("div");
        secWrap.className = "doc-sections";

        const secs = Array.isArray(hb.sections) ? hb.sections : [];
        secs.forEach((sec) => {
          const sBtn = document.createElement("button");
          sBtn.className = "doc-section-btn";
          sBtn.textContent = sec.title || sec.key || "Section";
          sBtn.onclick = async () => {
            const qs = `campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(hb.id)}&section=${encodeURIComponent(sec.key)}`;
            const data = await apiGet(`${HANDBOOKS_URL}?${qs}`);
            const section = data.section || {};
            const handbook = data.handbook || {};

            renderSectionViewUI({
              headerTitle: handbook.title || hb.title || "Parent Handbook",
              metaLine: `Campus: ${campus} • Program: ${handbook.program || hb.program || ""}`,
              sectionTitle: section.title || section.key,
              sectionContent: section.content || "",
              link: handbook.link || hb.link || null,
              onBack: async () => openMenuPanel("handbook"),
              onAsk: () => {
                closeMenuPanel();
                askPolicy(`Using Parent Handbook (Campus ${campus}, Program ${program}), section "${section.title || section.key}": `);
              },
              onSummary: async () => {
                closeMenuPanel();
                await askPolicy(`Summarize key points of this Parent Handbook section:`, {
                  focus: { source_type: "handbook", doc_id: hb.id, section_key: sec.key }
                });
              }
            });
          };
          secWrap.appendChild(sBtn);
        });

        wrap.appendChild(secWrap);
      }
    });
  } catch (err) {
    wrap.querySelector("#doc-loading").textContent = err?.message || "Could not load handbooks.";
  }
}

// ============================
// POLICIES BROWSER
// ============================
async function renderPoliciesBrowser() {
  const wrap = document.createElement("div");
  wrap.className = "doc-wrap";
  wrap.innerHTML = `
    <div class="doc-top">
      <div><b>Policies</b></div>
      <div class="doc-meta">Browse documents → open sections</div>
    </div>
    <div class="muted" id="doc-loading">Loading policies...</div>
  `;
  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(wrap);

  try {
    if (!policiesListCache.length) {
      const data = await apiGet(`${POLICIES_URL}`);
      policiesListCache = data.policies || [];
    }

    const loading = wrap.querySelector("#doc-loading");
    if (loading) loading.remove();

    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = "Select a policy to view sections:";
    wrap.appendChild(label);

    policiesListCache.forEach((d) => {
      const btn = document.createElement("button");
      btn.className = "doc-btn";
      btn.innerHTML = `<div class="doc-title">${escapeHtml(d.title || "Policy")}</div>`;
      const isOpen = policyOpenId === d.id;

      btn.onclick = async () => {
        policyOpenId = isOpen ? null : d.id;
        await openMenuPanel("policies");
      };

      wrap.appendChild(btn);

      if (isOpen) {
        const secWrap = document.createElement("div");
        secWrap.className = "doc-sections";

        const secs = Array.isArray(d.sections) ? d.sections : [];
        secs.forEach((sec) => {
          const sBtn = document.createElement("button");
          sBtn.className = "doc-section-btn";
          sBtn.textContent = sec.title || sec.key || "Section";
          sBtn.onclick = async () => {
            const data = await apiGet(`${POLICIES_URL}?id=${encodeURIComponent(d.id)}&section=${encodeURIComponent(sec.key)}`);
            const section = data.section || {};
            const policy = data.policy || {};

            renderSectionViewUI({
              headerTitle: policy.title || d.title || "Policy",
              metaLine: `Category: Policies`,
              sectionTitle: section.title || section.key,
              sectionContent: section.content || "",
              link: policy.link || d.link || null,
              onBack: async () => openMenuPanel("policies"),
              onAsk: () => {
                closeMenuPanel();
                askPolicy(`Using Policy "${policy.title || d.title}", section "${section.title || section.key}": `);
              },
              onSummary: async () => {
                closeMenuPanel();
                await askPolicy(`Summarize key points of this policy section:`, {
                  focus: { source_type: "policy", doc_id: d.id, section_key: sec.key }
                });
              }
            });
          };
          secWrap.appendChild(sBtn);
        });

        wrap.appendChild(secWrap);
      }
    });
  } catch (err) {
    wrap.querySelector("#doc-loading").textContent = err?.message || "Could not load policies.";
  }
}

// ============================
// PROTOCOLS BROWSER
// ============================
async function renderProtocolsBrowser() {
  const wrap = document.createElement("div");
  wrap.className = "doc-wrap";
  wrap.innerHTML = `
    <div class="doc-top">
      <div><b>Protocols</b></div>
      <div class="doc-meta">Browse documents → open sections</div>
    </div>
    <div class="muted" id="doc-loading">Loading protocols...</div>
  `;
  menuPanelBody.innerHTML = "";
  menuPanelBody.appendChild(wrap);

  try {
    if (!protocolsListCache.length) {
      const data = await apiGet(`${PROTOCOLS_URL}`);
      protocolsListCache = data.protocols || [];
    }

    const loading = wrap.querySelector("#doc-loading");
    if (loading) loading.remove();

    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = "Select a protocol to view sections:";
    wrap.appendChild(label);

    protocolsListCache.forEach((d) => {
      const btn = document.createElement("button");
      btn.className = "doc-btn";
      btn.innerHTML = `<div class="doc-title">${escapeHtml(d.title || "Protocol")}</div>`;
      const isOpen = protocolOpenId === d.id;

      btn.onclick = async () => {
        protocolOpenId = isOpen ? null : d.id;
        await openMenuPanel("protocols");
      };

      wrap.appendChild(btn);

      if (isOpen) {
        const secWrap = document.createElement("div");
        secWrap.className = "doc-sections";

        const secs = Array.isArray(d.sections) ? d.sections : [];
        secs.forEach((sec) => {
          const sBtn = document.createElement("button");
          sBtn.className = "doc-section-btn";
          sBtn.textContent = sec.title || sec.key || "Section";
          sBtn.onclick = async () => {
            const data = await apiGet(`${PROTOCOLS_URL}?id=${encodeURIComponent(d.id)}&section=${encodeURIComponent(sec.key)}`);
            const section = data.section || {};
            const protocol = data.protocol || {};

            renderSectionViewUI({
              headerTitle: protocol.title || d.title || "Protocol",
              metaLine: `Category: Protocols`,
              sectionTitle: section.title || section.key,
              sectionContent: section.content || "",
              link: protocol.link || d.link || null,
              onBack: async () => openMenuPanel("protocols"),
              onAsk: () => {
                closeMenuPanel();
                askPolicy(`Using Protocol "${protocol.title || d.title}", section "${section.title || section.key}": `);
              },
              onSummary: async () => {
                closeMenuPanel();
                await askPolicy(`Summarize key points of this protocol section:`, {
                  focus: { source_type: "protocol", doc_id: d.id, section_key: sec.key }
                });
              }
            });
          };
          secWrap.appendChild(sBtn);
        });

        wrap.appendChild(secWrap);
      }
    });
  } catch (err) {
    wrap.querySelector("#doc-loading").textContent = err?.message || "Could not load protocols.";
  }
}

// ============================
// CHAT / SEARCH (multi results)
// ============================
function renderResultsInChat(results) {
  if (!Array.isArray(results) || !results.length) {
    addMessage("assistant", `<b>Answer:</b><br><br>No matching document found. Please try another wording.`);
    return;
  }

  // show all results (policies/protocols/handbook)
  const blocks = results.map((r) => {
    const badge = r.label ? `<span class="result-badge">${escapeHtml(r.label)}</span>` : "";
    const program = r.program ? `<div class="result-meta">Program: <b>${escapeHtml(r.program)}</b></div>` : "";
    const why = r.why ? `<div class="result-why">${escapeHtml(r.why)}</div>` : "";
    const link = r.link ? `<a class="result-link" href="${escapeHtml(r.link)}" target="_blank" rel="noopener">Open full document</a>` : "";

    return `
      <div class="result-card">
        <div class="result-head">
          ${badge}
          <div class="result-title">${escapeHtml(r.title || "Document")}</div>
        </div>
        ${program}
        <div class="result-answer">${escapeHtml(r.answer || "")}</div>
        ${why}
        ${link}
      </div>
    `;
  }).join("");

  addMessage("assistant", blocks);
}

async function askPolicy(question, extra = {}) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;

  const campus = getCampus();
  const program = getProgram();
  if (!campus) {
    addMessage("assistant", "Please select a campus first.");
    return;
  }

  const role = getActiveUserRole();
  const token = getActiveBearerTokenForChat();

  if (!role || !token) {
    addMessage("assistant", `To use chat, login with a <b>Staff</b> or <b>Parent</b> code.`);
    return;
  }

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: trimmed, campus, program, ...extra })
    });

    hideTyping();

    if (res.status === 429) {
      addMessage("assistant", "Too many requests. Please wait and try again.");
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

    // focus response
    if (data.mode === "focus") {
      const src = data.source || {};
      const badge = src.type ? `<span class="result-badge">${escapeHtml(src.type.toUpperCase())}</span>` : "";
      const title = src.title ? escapeHtml(src.title) : "Answer";
      const sec = src.section_title ? ` • <b>${escapeHtml(src.section_title)}</b>` : "";
      const link = src.link ? `<br><a class="result-link" href="${escapeHtml(src.link)}" target="_blank" rel="noopener">Open full document</a>` : "";

      addMessage("assistant", `
        <div class="result-card">
          <div class="result-head">${badge}<div class="result-title">${title}${sec}</div></div>
          <div class="result-answer">${escapeHtml(data.answer || "")}</div>
          ${link}
        </div>
      `);
      return;
    }

    // search response
    if (data.ok && Array.isArray(data.results)) {
      renderResultsInChat(data.results);
      return;
    }

    addMessage("assistant", `<b>Answer:</b><br><br>${escapeHtml(data.answer || "Done.")}`);
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
  if (!getProgram()) setProgram("All Programs");
  syncHeaderSelections();

  if (isStaffActive() || isParentActive()) {
    showChatUI();
    clearChat();
    syncModeBadge();

    const role = getActiveUserRole();
    applyRoleUI(role);

    addMessage(
      "assistant",
      `Welcome back 👋<br>
       Signed in as <b>${role === "parent" ? "Parent" : "Staff"}</b><br>
       <b>Campus: ${escapeHtml(getCampus() || "(not selected)")} • Program: ${escapeHtml(getProgram())}</b><br><br>
       Use the buttons above to browse documents, or search in chat.`
    );
    return;
  }

  if (isAdminActive()) {
    showChatUI();
    clearChat();
    syncModeBadge();
    addMessage("assistant", `✅ Admin mode enabled. You can browse Policies / Protocols / Handbook.`);
    return;
  }

  showLoginUI();
})();
