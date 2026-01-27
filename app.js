// ============================
// CMS Policy Chatbot - app.js (UPDATED)
// Fixes:
// - No fake questions when selecting handbook
// - Handbook acts as CONTEXT only
// - Questions are sent ONLY when user types
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
  adminUntil: "cms_admin_until",
  activeHandbook: "cms_active_handbook" // 👈 NEW
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

const campusSelect = document.getElementById("campus-select");
const campusSwitch = document.getElementById("campus-switch");

const adminModeBtn = document.getElementById("admin-mode-btn");
const modeBadge = document.getElementById("mode-badge");

const menuPills = document.querySelectorAll(".menu-pill");
const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

// ============================
// UI HELPERS
// ============================
function addMessage(role, html) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = html;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clearChat() {
  chatWindow.innerHTML = "";
}

// ============================
// SESSION HELPERS
// ============================
function setCampus(c) {
  const campus = (c || "MC").toUpperCase();
  localStorage.setItem(LS.campus, campus);
  if (campusSelect) campusSelect.value = campus;
  if (campusSwitch) campusSwitch.value = campus;
}

function getCampus() {
  return localStorage.getItem(LS.campus) || "MC";
}

function isStaffActive() {
  return (
    localStorage.getItem(LS.staffToken) &&
    Date.now() < Number(localStorage.getItem(LS.staffUntil) || 0)
  );
}

function getStaffToken() {
  return localStorage.getItem(LS.staffToken);
}

// ============================
// LOGIN
// ============================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  loginError.textContent = "";
  const code = accessCodeInput.value.trim();
  const campus = campusSelect.value;

  if (!code) return;

  const res = await fetch(STAFF_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    loginError.textContent = data.error || "Invalid code";
    return;
  }

  localStorage.setItem(LS.staffToken, data.token);
  localStorage.setItem(
    LS.staffUntil,
    Date.now() + data.expires_in * 1000
  );

  setCampus(campus);
  localStorage.removeItem(LS.activeHandbook);

  accessCodeInput.value = "";
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  headerActions.classList.remove("hidden");

  clearChat();
  addMessage(
    "assistant",
    `Welcome 👋<br>
     Campus: <b>${escapeHtml(getCampus())}</b><br>
     Ask about policies, protocols, or the Parent Handbook.`
  );
});

// ============================
// LOGOUT
// ============================
logoutBtn.addEventListener("click", () => {
  localStorage.clear();
  clearChat();
  loginScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
  headerActions.classList.add("hidden");
});

// ============================
// MENU: HANDBOOK (FIXED)
// ============================
menuPills.forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.menu;
    openMenu(type);
  });
});

function openMenu(type) {
  menuPanelBody.innerHTML = "";
  menuPanelTitle.textContent =
    type === "handbook" ? "Parent Handbook" : type;

  if (type === "handbook") {
    const campus = getCampus();
    const p = document.createElement("p");
    p.innerHTML = `
      <b>Parent Handbook – ${campus}</b><br>
      This handbook is now active.<br>
      Ask any question about it in the chat.
    `;
    menuPanelBody.appendChild(p);

    // 👇 ONLY SET CONTEXT — NO QUESTION
    localStorage.setItem(
      LS.activeHandbook,
      `Parent Handbook – ${campus}`
    );

    addMessage(
      "assistant",
      `<b>Parent Handbook selected (${campus})</b><br>
       You can now ask questions about this handbook.`
    );
  }

  menuPanel.classList.remove("hidden");
  menuOverlay.classList.remove("hidden");
}

menuPanelClose.addEventListener("click", closeMenu);
menuOverlay.addEventListener("click", closeMenu);

function closeMenu() {
  menuPanel.classList.add("hidden");
  menuOverlay.classList.add("hidden");
}

// ============================
// CHAT / API
// ============================
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!isStaffActive()) return;

  const question = userInput.value.trim();
  if (!question) return;

  userInput.value = "";

  const campus = getCampus();
  const handbook = localStorage.getItem(LS.activeHandbook);

  addMessage("user", escapeHtml(question));

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getStaffToken()}`
    },
    body: JSON.stringify({
      query: question,
      campus,
      role: "staff",
      handbook // 👈 CONTEXT ONLY
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    addMessage("assistant", escapeHtml(data.error || "Error"));
    return;
  }

  const title = data.policy?.title || "Answer";
  const link = data.policy?.link
    ? `<br><a href="${data.policy.link}" target="_blank">Open handbook</a>`
    : "";

  addMessage(
    "assistant",
    `<b>${escapeHtml(title)}</b><br><br>${escapeHtml(data.answer)}${link}`
  );
});

// ============================
// INIT
// ============================
(function init() {
  setCampus(getCampus());

  if (!isStaffActive()) {
    loginScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
  }
})();