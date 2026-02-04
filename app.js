/* =========================================================
   app.js — CMS Policy Chatbot (FULL)
   - Staff/Parent login + campus required
   - Admin PIN modal (stores admin token)
   - Top menus: Policies / Protocols / Parent Handbook
   - Menu panel overlay with clickable items
   - Parent Handbook browser via GET /handbooks
   - Chat via POST /api { query, campus }
   ========================================================= */

const LS = {
  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",
  parentToken: "cms_parent_token",
  parentUntil: "cms_parent_until",
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until",
  campus: "cms_campus",
  role: "cms_role" // staff | parent
};

// ✅ IMPORTANT: use SAME-ORIGIN endpoints (Pages Functions)
// so no CORS pain and no direct worker origin in frontend.
const API_URL = "/api";
const AUTH = {
  staff: "/auth/staff",
  parent: "/auth/parent",
  admin: "/auth/admin"
};
const HANDBOOKS_URL = "/handbooks"; // GET /handbooks?campus=YC[&id=...][&section=...]

const $ = (id) => document.getElementById(id);

// ---------- DOM ----------
const loginScreen = $("login-screen");
const chatScreen = $("chat-screen");

const loginForm = $("login-form");
const accessCodeEl = $("access-code");
const campusSelectEl = $("campus-select");
const loginErrorEl = $("login-error");
const loginAdminBtn = $("login-admin-btn");

const headerActions = $("header-actions");
const campusSwitch = $("campus-switch");
const adminModeBtn = $("admin-mode-btn");
const modeBadge = $("mode-badge");
const logoutBtn = $("logout-btn");

const topMenuBar = $("top-menu-bar");
const adminLinks = $("admin-links");

const chatWindow = $("chat-window");
const chatForm = $("chat-form");
const userInput = $("user-input");

const menuOverlay = $("menu-overlay");
const menuPanel = $("menu-panel");
const menuPanelTitle = $("menu-panel-title");
const menuPanelBody = $("menu-panel-body");
const menuPanelClose = $("menu-panel-close");

const adminModal = $("admin-modal");
const adminPinEl = $("admin-pin");
const adminPinCancel = $("admin-pin-cancel");
const adminPinSubmit = $("admin-pin-submit");

// ---------- Helpers ----------
function now() { return Date.now(); }

function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle("hidden", !!hidden);
}

function safeUpper(x) {
  return String(x || "").trim().toUpperCase();
}

function safeLower(x) {
  return String(x || "").trim().toLowerCase();
}

function setLoginError(msg) {
  if (!loginErrorEl) return;
  loginErrorEl.textContent = msg || "";
}

function tokenActive(tokenKey, untilKey) {
  const t = localStorage.getItem(tokenKey) || "";
  const u = Number(localStorage.getItem(untilKey) || "0");
  return !!t && now() < u;
}

function getRole() {
  return localStorage.getItem(LS.role) || "";
}

function setRole(role) {
  localStorage.setItem(LS.role, role);
}

function getCampus() {
  return localStorage.getItem(LS.campus) || "";
}

function setCampus(campus) {
  localStorage.setItem(LS.campus, campus);
}

function getChatToken() {
  const role = getRole();
  if (role === "staff") return localStorage.getItem(LS.staffToken) || "";
  if (role === "parent") return localStorage.getItem(LS.parentToken) || "";
  return "";
}

function isChatActive() {
  const role = getRole();
  if (role === "staff") return tokenActive(LS.staffToken, LS.staffUntil);
  if (role === "parent") return tokenActive(LS.parentToken, LS.parentUntil);
  return false;
}

function isAdminActive() {
  return tokenActive(LS.adminToken, LS.adminUntil);
}

function setModeBadge() {
  const role = getRole() || "STAFF";
  const isAdmin = isAdminActive();

  if (!modeBadge) return;
  if (isAdmin) {
    modeBadge.textContent = "ADMIN";
    modeBadge.classList.add("admin");
  } else {
    modeBadge.textContent = (role || "staff").toUpperCase();
    modeBadge.classList.remove("admin");
  }
}

function showToastInChat(text) {
  addMsg("assistant", text);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addMsg(who, text) {
  if (!chatWindow) return;
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.innerHTML = linkify(escapeHtml(String(text || "")));
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function linkify(htmlEscapedText) {
  // super simple URL linkify on escaped text
  const urlRe = /(https?:\/\/[^\s]+)/g;
  return htmlEscapedText.replace(urlRe, (m) => {
    const u = m.replaceAll('"', "");
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  });
}

function showTyping(show) {
  let el = document.getElementById("typing");
  if (show) {
    if (el) return;
    el = document.createElement("div");
    el.id = "typing";
    el.className = "typing-bubble";
    el.innerHTML = `
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <div class="muted" style="font-weight:800">Thinking…</div>
    `;
    chatWindow.appendChild(el);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } else {
    el?.remove();
  }
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// ---------- UI: open/close menu panel ----------
function openMenu(title, html) {
  menuPanelTitle.textContent = title || "Menu";
  menuPanelBody.innerHTML = html || "";
  setHidden(menuOverlay, false);
  setHidden(menuPanel, false);
  menuPanel.setAttribute("aria-hidden", "false");
}

function closeMenu() {
  setHidden(menuOverlay, true);
  setHidden(menuPanel, true);
  menuPanel.setAttribute("aria-hidden", "true");
}

menuOverlay?.addEventListener("click", closeMenu);
menuPanelClose?.addEventListener("click", closeMenu);

// ---------- Auth ----------
async function loginAs(role, code, campus) {
  setLoginError("");

  const endpoint = role === "parent" ? AUTH.parent : AUTH.staff;
  const payload = { code: String(code || "").trim() };

  const { res, data } = await jsonFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok || !data.ok) {
    setLoginError(data.error || `Login failed (${res.status})`);
    return false;
  }

  // store token
  const expiresIn = Number(data.expires_in || 28800);
  const until = now() + expiresIn * 1000;

  if (role === "parent") {
    localStorage.setItem(LS.parentToken, data.token);
    localStorage.setItem(LS.parentUntil, String(until));
  } else {
    localStorage.setItem(LS.staffToken, data.token);
    localStorage.setItem(LS.staffUntil, String(until));
  }

  setRole(role);
  setCampus(campus);

  return true;
}

function logoutAll() {
  // clear all sessions
  [
    LS.staffToken, LS.staffUntil,
    LS.parentToken, LS.parentUntil,
    LS.adminToken, LS.adminUntil,
    LS.role
  ].forEach((k) => localStorage.removeItem(k));

  // keep campus optional; I usually keep it for convenience, ولی می‌تونی پاکش کنی:
  // localStorage.removeItem(LS.campus);

  renderAppState();
}

// ---------- Admin PIN modal ----------
function openAdminModal() {
  adminPinEl.value = "";
  setHidden(adminModal, false);
  adminModal.setAttribute("aria-hidden", "false");
  setTimeout(() => adminPinEl?.focus(), 50);
}

function closeAdminModal() {
  setHidden(adminModal, true);
  adminModal.setAttribute("aria-hidden", "true");
}

adminPinCancel?.addEventListener("click", closeAdminModal);

adminPinSubmit?.addEventListener("click", async () => {
  const pin = String(adminPinEl.value || "").trim();
  if (!pin) return;

  const { res, data } = await jsonFetch(AUTH.admin, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });

  if (!res.ok || !data.ok) {
    alert(data.error || "Admin PIN invalid");
    return;
  }

  const expiresIn = Number(data.expires_in || 28800);
  localStorage.setItem(LS.adminToken, data.token);
  localStorage.setItem(LS.adminUntil, String(now() + expiresIn * 1000));

  closeAdminModal();
  setModeBadge();
  renderAdminLinks();
  showToastInChat("✅ Admin mode enabled.");
});

// ---------- Admin links visibility ----------
function renderAdminLinks() {
  const admin = isAdminActive();
  setHidden(adminLinks, !admin);
}

// ---------- App state render ----------
function renderAppState() {
  const active = isChatActive();
  const campus = getCampus();

  if (!active) {
    // show login
    setHidden(loginScreen, false);
    setHidden(chatScreen, true);

    setHidden(headerActions, true);
    setHidden(topMenuBar, true);

    // prefill campus select from storage
    if (campusSelectEl) campusSelectEl.value = campus || "";
    return;
  }

  // show chat
  setHidden(loginScreen, true);
  setHidden(chatScreen, false);

  setHidden(headerActions, false);
  setHidden(topMenuBar, false);

  // sync campus switch
  if (campusSwitch) {
    campusSwitch.value = campus || "";
  }

  setModeBadge();
  renderAdminLinks();
}

// ---------- Menu data ----------
function buildQuickList(title, items) {
  const buttons = items.map(it => {
    return `
      <button class="menu-item-btn" type="button" data-q="${escapeHtml(it.q)}">
        ${escapeHtml(it.label)}
      </button>
    `;
  }).join("");

  return `
    <div class="menu-group-label">${escapeHtml(title)}</div>
    ${buttons || `<div class="small muted">No items.</div>`}
  `;
}

function attachMenuButtonHandlers() {
  // handle clicks inside menu panel for quick questions
  menuPanelBody?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-q]");
    if (!btn) return;
    const q = btn.getAttribute("data-q") || "";
    closeMenu();
    await askQuestion(q);
  });

  // handle handbook section open buttons
  menuPanelBody?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-hb][data-section]");
    if (!btn) return;
    const hbId = btn.getAttribute("data-hb");
    const sectionKey = btn.getAttribute("data-section");
    const campus = getCampus();
    closeMenu();
    await openHandbookSection(campus, hbId, sectionKey);
  });

  // open handbook link
  menuPanelBody?.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a[data-external]");
    if (!a) return;
    // default behavior ok (open new tab)
  });
}

// ---------- API calls ----------
async function askQuestion(questionText) {
  const campus = getCampus();
  const role = getRole();
  const token = getChatToken();

  if (!token) {
    showToastInChat("Session expired. Please login again.");
    logoutAll();
    return;
  }
  if (!campus) {
    showToastInChat("Campus missing. Please login again and select a campus.");
    logoutAll();
    return;
  }

  const q = String(questionText || "").trim();
  if (!q) return;

  addMsg("user", q);
  showTyping(true);

  const { res, data } = await jsonFetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ query: q, campus })
  });

  showTyping(false);

  if (!res.ok) {
    addMsg("assistant", `❌ Error: ${data.error || res.status}`);
    return;
  }

  // Render answer
  const answer = data.answer || "";
  addMsg("assistant", answer || "—");

  // Optional: show source
  if (data.source?.title) {
    const srcLine =
      `📌 Source: ${data.source.title}` +
      (data.source.type ? ` (${data.source.type})` : "");
    addMsg("assistant", srcLine);
  }

  // If handbook_section returned, show it
  if (data.handbook_section?.section_title || data.handbook_section?.section_content) {
    const t = data.handbook_section.section_title ? `\n\n${data.handbook_section.section_title}\n` : "";
    const c = data.handbook_section.section_content || "";
    addMsg("assistant", `📄 Handbook Section:${t}\n${c}`);
  }

  // debug info (optional)
  // if (data.match_reason) addMsg("assistant", `🔎 ${data.match_reason}`);
}

async function fetchHandbooksList(campus) {
  const token = getChatToken();
  const url = `${HANDBOOKS_URL}?campus=${encodeURIComponent(campus)}`;

  const { res, data } = await jsonFetch(url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok || !data.ok) throw new Error(data.error || `Failed to load handbooks (${res.status})`);
  return data.handbooks || [];
}

async function openHandbookSection(campus, hbId, sectionKey) {
  const token = getChatToken();
  const url =
    `${HANDBOOKS_URL}?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(hbId)}&section=${encodeURIComponent(sectionKey)}`;

  showTyping(true);

  const { res, data } = await jsonFetch(url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}` }
  });

  showTyping(false);

  if (!res.ok || !data.ok) {
    addMsg("assistant", `❌ Handbook error: ${data.error || res.status}`);
    return;
  }

  const hbTitle = data.handbook?.title || "Parent Handbook";
  const secTitle = data.section?.title || data.section?.key || "";
  const secContent = data.section?.content || "";

  addMsg("assistant", `📘 ${hbTitle}\n\n${secTitle}\n\n${secContent}`);
}

// ---------- Menu clicks ----------
async function handleMenuClick(which) {
  const campus = getCampus();
  if (!campus) {
    alert("Please select a campus first.");
    return;
  }

  if (which === "policies") {
    const html =
      buildQuickList("Policies", [
        { label: "Safe arrival / pickup rules", q: "What is the safe arrival and pickup procedure?" },
        { label: "Uniform / dress code", q: "What is the uniform or dress code policy?" },
        { label: "Fees / payments / NSF", q: "What is the policy for fees, late payments, or NSF?" },
        { label: "Sick policy (fever, symptoms)", q: "What is the illness policy (fever, symptoms)?" }
      ]) +
      `<div class="small muted" style="margin-top:10px">Tip: You can also type any question in chat.</div>`;

    openMenu("Policies", html);
    return;
  }

  if (which === "protocols") {
    const html =
      buildQuickList("Protocols", [
        { label: "Emergency / fire procedure", q: "What is the emergency or fire evacuation protocol?" },
        { label: "Lockdown protocol", q: "What is the lockdown protocol?" },
        { label: "Allergy / anaphylaxis protocol", q: "What is the anaphylaxis / EpiPen protocol?" },
        { label: "Incident reporting", q: "How do staff report incidents and document them?" }
      ]);

    openMenu("Protocols", html);
    return;
  }

  if (which === "handbook") {
    // Load handbook list and show sections
    try {
      openMenu("Parent Handbook", `<div class="muted" style="font-weight:800">Loading handbooks…</div>`);
      const list = await fetchHandbooksList(campus);

      if (!list.length) {
        openMenu("Parent Handbook", `<div class="small muted">No handbooks found for campus ${escapeHtml(campus)}.</div>`);
        return;
      }

      const cards = list.map(hb => {
        const sections = (hb.sections || []).map(s => {
          const key = s.key || "";
          const title = s.title || key;
          return `
            <button class="hb-section-btn" type="button"
              data-hb="${escapeHtml(hb.id)}"
              data-section="${escapeHtml(key)}">
              ${escapeHtml(title)}
            </button>
          `;
        }).join("");

        const link = hb.link
          ? `<a data-external="1" href="${escapeHtml(hb.link)}" target="_blank" rel="noopener noreferrer">Open original handbook link</a>`
          : "";

        return `
          <div class="hb-card">
            <div class="hb-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
            <div class="hb-meta">
              Campus: <b>${escapeHtml(hb.campus || campus)}</b>
              ${hb.program ? ` · Program: <b>${escapeHtml(hb.program)}</b>` : ""}
            </div>

            ${link ? `<div class="small" style="margin-top:8px">${link}</div>` : ""}

            <div style="margin-top:10px">
              <div class="menu-group-label">Sections</div>
              ${sections || `<div class="small muted">No sections.</div>`}
            </div>
          </div>
        `;
      }).join("");

      openMenu("Parent Handbook", cards);
    } catch (e) {
      openMenu("Parent Handbook", `<div class="small" style="color:#b91c1c;font-weight:800">${escapeHtml(e.message || "Failed")}</div>`);
    }
  }
}

// ---------- Events wiring ----------
function wireEvents() {
  // login submit
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setLoginError("");

    const code = String(accessCodeEl?.value || "").trim();
    const campus = safeUpper(campusSelectEl?.value);

    if (!campus) {
      setLoginError("Please select a campus.");
      return;
    }
    if (!code) {
      setLoginError("Please enter access code.");
      return;
    }

    // Try staff first, then parent (so one box works)
    let ok = await loginAs("staff", code, campus);
    if (!ok) {
      ok = await loginAs("parent", code, campus);
    }
    if (!ok) return;

    renderAppState();
    addMsg("assistant", `✅ Logged in. Campus: ${campus}. You can ask questions now.`);
  });

  // admin login button on login screen
  loginAdminBtn?.addEventListener("click", openAdminModal);

  // admin mode button in header (requires staff/parent session)
  adminModeBtn?.addEventListener("click", () => {
    if (!isChatActive()) {
      alert("Please login first.");
      return;
    }
    if (isAdminActive()) {
      alert("Admin mode already active.");
      return;
    }
    openAdminModal();
  });

  // campus switch in header
  campusSwitch?.addEventListener("change", () => {
    const c = safeUpper(campusSwitch.value);
    if (!c) return;
    setCampus(c);
    showToastInChat(`📍 Campus switched to ${c}.`);
  });

  // logout
  logoutBtn?.addEventListener("click", logoutAll);

  // chat submit
  chatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = String(userInput?.value || "").trim();
    if (!q) return;
    userInput.value = "";
    await askQuestion(q);
  });

  // menu pills
  document.querySelectorAll(".menu-pill[data-menu]")?.forEach(btn => {
    btn.addEventListener("click", async () => {
      const which = btn.getAttribute("data-menu");
      // active styling
      document.querySelectorAll(".menu-pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      await handleMenuClick(which);
    });
  });

  // modal close by ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
      closeAdminModal();
    }
  });

  attachMenuButtonHandlers();
}

// ---------- Init ----------
(function init() {
  // restore campus selects
  const c = getCampus();
  if (campusSelectEl && c) campusSelectEl.value = c;
  if (campusSwitch && c) campusSwitch.value = c;

  wireEvents();
  renderAppState();
  setModeBadge();

  // small welcome
  if (isChatActive() && chatWindow?.children?.length === 0) {
    addMsg("assistant", "Hi! Ask any CMS policy / protocol / parent handbook question. ✅");
  }
})();