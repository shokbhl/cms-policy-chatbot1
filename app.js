/* =========================================================
   CMS Policy Chatbot — app.js (FULL / Copy-Paste)
   Works with your index.html IDs:
   - login-screen, chat-screen
   - campus-select, access-code, login-form, login-admin-btn, login-error
   - header-actions, campus-switch, admin-mode-btn, mode-badge, logout-btn
   - top-menu-bar, admin-links, menu pills (data-menu)
   - menu-overlay, menu-panel, menu-panel-title, menu-panel-body, menu-panel-close
   - admin-modal, admin-pin, admin-pin-cancel, admin-pin-submit
   - chat-window, chat-form, user-input
   ========================================================= */

const LS = {
  role: "cms_role",                // staff | parent
  campus: "cms_campus",

  staffToken: "cms_staff_token",
  staffUntil: "cms_staff_until",

  parentToken: "cms_parent_token",
  parentUntil: "cms_parent_until",

  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

// Same-origin endpoints (Cloudflare Pages Functions)
const ENDPOINTS = {
  api: "/api",
  handbooks: "/handbooks",
  authStaff: "/auth/staff",
  authParent: "/auth/parent",
  authAdmin: "/auth/admin"
};

// ---------- DOM ----------
const el = (id) => document.getElementById(id);

const loginScreen = el("login-screen");
const chatScreen = el("chat-screen");

const loginForm = el("login-form");
const accessCode = el("access-code");
const campusSelect = el("campus-select");
const loginError = el("login-error");
const loginAdminBtn = el("login-admin-btn");

const headerActions = el("header-actions");
const campusSwitch = el("campus-switch");
const adminModeBtn = el("admin-mode-btn");
const modeBadge = el("mode-badge");
const logoutBtn = el("logout-btn");

const topMenuBar = el("top-menu-bar");
const adminLinks = el("admin-links");

const chatWindow = el("chat-window");
const chatForm = el("chat-form");
const userInput = el("user-input");

const menuOverlay = el("menu-overlay");
const menuPanel = el("menu-panel");
const menuPanelTitle = el("menu-panel-title");
const menuPanelBody = el("menu-panel-body");
const menuPanelClose = el("menu-panel-close");

const adminModal = el("admin-modal");
const adminPin = el("admin-pin");
const adminPinCancel = el("admin-pin-cancel");
const adminPinSubmit = el("admin-pin-submit");

// ---------- helpers ----------
const now = () => Date.now();

function setHidden(node, hidden) {
  if (!node) return;
  node.classList.toggle("hidden", !!hidden);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setError(msg) {
  if (!loginError) return;
  loginError.textContent = msg || "";
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
function setCampus(c) {
  localStorage.setItem(LS.campus, c);
}

function tokenActive(tokenKey, untilKey) {
  const t = localStorage.getItem(tokenKey) || "";
  const u = Number(localStorage.getItem(untilKey) || "0");
  return !!t && now() < u;
}

function chatActive() {
  const role = getRole();
  if (role === "staff") return tokenActive(LS.staffToken, LS.staffUntil);
  if (role === "parent") return tokenActive(LS.parentToken, LS.parentUntil);
  return false;
}

function adminActive() {
  return tokenActive(LS.adminToken, LS.adminUntil);
}

function getChatToken() {
  const role = getRole();
  if (role === "staff") return localStorage.getItem(LS.staffToken) || "";
  if (role === "parent") return localStorage.getItem(LS.parentToken) || "";
  return "";
}

function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
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
  const urlRe = /(https?:\/\/[^\s]+)/g;
  return htmlEscapedText.replace(urlRe, (m) => {
    const u = m.replaceAll('"', "");
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  });
}

function showTyping(show) {
  let node = document.getElementById("typing");
  if (show) {
    if (node) return;
    node = document.createElement("div");
    node.id = "typing";
    node.className = "typing-bubble";
    node.innerHTML = `
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <div class="muted" style="font-weight:800">Thinking…</div>
    `;
    chatWindow.appendChild(node);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } else {
    node?.remove();
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// ---------- menu panel ----------
function openMenu(title, bodyHtml) {
  menuPanelTitle.textContent = title || "Menu";
  menuPanelBody.innerHTML = bodyHtml || "";
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

// ---------- admin modal ----------
function openAdminModal() {
  adminPin.value = "";
  setHidden(adminModal, false);
  adminModal.setAttribute("aria-hidden", "false");
  setTimeout(() => adminPin?.focus(), 50);
}

function closeAdminModal() {
  setHidden(adminModal, true);
  adminModal.setAttribute("aria-hidden", "true");
}

adminPinCancel?.addEventListener("click", closeAdminModal);

adminPinSubmit?.addEventListener("click", async () => {
  const pin = String(adminPin.value || "").trim();
  if (!pin) return;

  const { res, data } = await fetchJson(ENDPOINTS.authAdmin, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });

  if (!res.ok || !data.ok) {
    alert(data.error || "Admin PIN invalid");
    return;
  }

  const expires = Number(data.expires_in || 28800);
  localStorage.setItem(LS.adminToken, data.token);
  localStorage.setItem(LS.adminUntil, String(now() + expires * 1000));

  closeAdminModal();
  renderAdminLinks();
  renderModeBadge();
  addMsg("assistant", "✅ Admin mode enabled.");
});

// ---------- header ----------
function renderAdminLinks() {
  setHidden(adminLinks, !adminActive());
}

function renderModeBadge() {
  if (!modeBadge) return;

  if (adminActive()) {
    modeBadge.textContent = "ADMIN";
    modeBadge.classList.add("admin");
    return;
  }

  const role = (getRole() || "staff").toUpperCase();
  modeBadge.textContent = role;
  modeBadge.classList.remove("admin");
}

logoutBtn?.addEventListener("click", () => {
  [
    LS.role,
    LS.staffToken, LS.staffUntil,
    LS.parentToken, LS.parentUntil,
    LS.adminToken, LS.adminUntil
  ].forEach(k => localStorage.removeItem(k));

  renderState();
});

campusSwitch?.addEventListener("change", () => {
  const c = String(campusSwitch.value || "").trim().toUpperCase();
  if (!c) return;
  setCampus(c);
  addMsg("assistant", `📍 Campus switched to ${c}.`);
});

// ---------- login ----------
async function loginTry(role, code, campus) {
  const endpoint = role === "staff" ? ENDPOINTS.authStaff : ENDPOINTS.authParent;

  const { res, data } = await fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });

  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || `Login failed (${res.status})` };
  }

  const expires = Number(data.expires_in || 28800);
  const until = now() + expires * 1000;

  setRole(role);
  setCampus(campus);

  if (role === "staff") {
    localStorage.setItem(LS.staffToken, data.token);
    localStorage.setItem(LS.staffUntil, String(until));
  } else {
    localStorage.setItem(LS.parentToken, data.token);
    localStorage.setItem(LS.parentUntil, String(until));
  }

  return { ok: true };
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("");

  const code = String(accessCode?.value || "").trim();
  const campus = String(campusSelect?.value || "").trim().toUpperCase();

  if (!campus) return setError("Please select a campus.");
  if (!code) return setError("Please enter access code.");

  // Try staff then parent (single input)
  let r = await loginTry("staff", code, campus);
  if (!r.ok) r = await loginTry("parent", code, campus);

  if (!r.ok) {
    setError(r.error || "Login failed");
    return;
  }

  renderState();
  addMsg("assistant", `✅ Logged in. Campus: ${campus}.`);
});

loginAdminBtn?.addEventListener("click", openAdminModal);
adminModeBtn?.addEventListener("click", () => {
  if (!chatActive()) return alert("Please login first.");
  if (adminActive()) return alert("Admin already active.");
  openAdminModal();
});

// ---------- chat ----------
async function ask(query) {
  const q = String(query || "").trim();
  if (!q) return;

  const token = getChatToken();
  const campus = getCampus();

  if (!token || !campus) {
    addMsg("assistant", "Session expired. Please login again.");
    return renderState();
  }

  addMsg("user", q);
  showTyping(true);

  const { res, data } = await fetchJson(ENDPOINTS.api, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ query: q, campus })
  });

  showTyping(false);

  if (!res.ok) {
    addMsg("assistant", `❌ ${data.error || `Error ${res.status}`}`);
    return;
  }

  addMsg("assistant", data.answer || "—");

  if (data.source?.title) {
    addMsg("assistant", `📌 Source: ${data.source.title}${data.source.type ? ` (${data.source.type})` : ""}`);
  }

  if (data.handbook_section?.section_title || data.handbook_section?.section_content) {
    const t = data.handbook_section.section_title ? `\n\n${data.handbook_section.section_title}\n` : "";
    const c = data.handbook_section.section_content || "";
    addMsg("assistant", `📄 Handbook Section:${t}\n${c}`);
  }
}

chatForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = String(userInput?.value || "").trim();
  if (!q) return;
  userInput.value = "";
  await ask(q);
});

// ---------- handbook menu ----------
async function fetchHandbooks(campus) {
  const token = getChatToken();
  const { res, data } = await fetchJson(`${ENDPOINTS.handbooks}?campus=${encodeURIComponent(campus)}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
  return data.handbooks || [];
}

async function openHandbookSection(hbId, sectionKey) {
  const token = getChatToken();
  const campus = getCampus();

  showTyping(true);

  const url =
    `${ENDPOINTS.handbooks}?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(hbId)}&section=${encodeURIComponent(sectionKey)}`;

  const { res, data } = await fetchJson(url, {
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

// Listen clicks inside menu panel
menuPanelBody?.addEventListener("click", async (e) => {
  const btnQ = e.target?.closest?.("button[data-q]");
  if (btnQ) {
    const q = btnQ.getAttribute("data-q") || "";
    closeMenu();
    await ask(q);
    return;
  }

  const btnSec = e.target?.closest?.("button[data-hb][data-section]");
  if (btnSec) {
    const hbId = btnSec.getAttribute("data-hb");
    const sectionKey = btnSec.getAttribute("data-section");
    closeMenu();
    await openHandbookSection(hbId, sectionKey);
  }
});

// ---------- menus ----------
function quickList(title, items) {
  return `
    <div class="menu-group-label">${escapeHtml(title)}</div>
    ${items.map(it => `
      <button class="menu-item-btn" type="button" data-q="${escapeHtml(it.q)}">
        ${escapeHtml(it.label)}
      </button>
    `).join("")}
  `;
}

async function openPoliciesMenu() {
  openMenu("Policies", quickList("Common policy questions", [
    { label: "Illness policy (fever / symptoms)", q: "What is the illness policy (fever, symptoms)?" },
    { label: "Arrival / dismissal", q: "What is the arrival and dismissal procedure?" },
    { label: "Uniform / dress code", q: "What is the uniform or dress code policy?" },
    { label: "Payments / late fees / NSF", q: "What is the policy for late payments or NSF?" }
  ]));
}

async function openProtocolsMenu() {
  openMenu("Protocols", quickList("Common protocol questions", [
    { label: "Fire / evacuation protocol", q: "What is the fire evacuation protocol?" },
    { label: "Lockdown protocol", q: "What is the lockdown protocol?" },
    { label: "Anaphylaxis / EpiPen", q: "What is the anaphylaxis / EpiPen protocol?" },
    { label: "Incident reporting", q: "How do staff report incidents?" }
  ]));
}

async function openHandbookMenu() {
  const campus = getCampus();
  if (!campus) {
    openMenu("Parent Handbook", `<div class="muted" style="font-weight:800">Select a campus first.</div>`);
    return;
  }

  openMenu("Parent Handbook", `<div class="muted" style="font-weight:800">Loading handbooks…</div>`);

  try {
    const list = await fetchHandbooks(campus);

    if (!list.length) {
      openMenu("Parent Handbook", `<div class="small muted">No handbooks found for campus ${escapeHtml(campus)}.</div>`);
      return;
    }

    const cards = list.map(hb => {
      const sections = (hb.sections || []).map(s => `
        <button class="hb-section-btn" type="button"
          data-hb="${escapeHtml(hb.id)}"
          data-section="${escapeHtml(s.key || "")}">
          ${escapeHtml(s.title || s.key || "")}
        </button>
      `).join("");

      const link = hb.link
        ? `<div class="small" style="margin-top:8px">
            <a data-external="1" href="${escapeHtml(hb.link)}" target="_blank" rel="noopener noreferrer">
              Open original handbook link
            </a>
          </div>`
        : "";

      return `
        <div class="hb-card">
          <div class="hb-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
          <div class="hb-meta">
            Campus: <b>${escapeHtml(hb.campus || campus)}</b>
            ${hb.program ? ` · Program: <b>${escapeHtml(hb.program)}</b>` : ""}
          </div>
          ${link}
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

// Wire menu pill clicks
document.querySelectorAll(".menu-pill[data-menu]")?.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const which = btn.getAttribute("data-menu");

    // active class
    document.querySelectorAll(".menu-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    if (which === "policies") return openPoliciesMenu();
    if (which === "protocols") return openProtocolsMenu();
    if (which === "handbook") return openHandbookMenu();
  });
});

// ESC close overlays
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenu();
    closeAdminModal();
  }
});

// ---------- state render ----------
function renderState() {
  const active = chatActive();
  const campus = getCampus();

  if (!active) {
    setHidden(loginScreen, false);
    setHidden(chatScreen, true);
    setHidden(headerActions, true);
    setHidden(topMenuBar, true);

    // restore campus in login select
    if (campusSelect) campusSelect.value = campus || "";
    return;
  }

  setHidden(loginScreen, true);
  setHidden(chatScreen, false);
  setHidden(headerActions, false);
  setHidden(topMenuBar, false);

  // sync campus switch
  if (campusSwitch) campusSwitch.value = campus || "";

  renderAdminLinks();
  renderModeBadge();
}

(function init() {
  // restore campus UI
  const c = getCampus();
  if (c && campusSelect) campusSelect.value = c;
  if (c && campusSwitch) campusSwitch.value = c;

  renderState();

  if (chatActive() && chatWindow?.children?.length === 0) {
    addMsg("assistant", "Hi! Ask any CMS policy / protocol / parent handbook question. ✅");
  }
})();