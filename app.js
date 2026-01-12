// app.js (FINAL) — SSO (Cloudflare Access) + Campus picker (on entry + switcher) + Admin Mode via ADMIN_PIN token
// Works with worker.js routes:
// - POST /api          { query, campus }
// - POST /auth/admin   { code } -> { admin_token, expires_at }
//
// Notes:
// - This file assumes your Worker is at API_URL below.
// - Cloudflare Access protects the Pages site + Worker. If Access blocks, /api will return 401.

const API_URL = ""; // same-origin (Pages Functions proxy)

// ===== Menus (same as your working version) =====
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
  handbook: [
    // (optional) could list handbook sections later, but we keep it menu-empty
  ]
};

// ===== Storage keys =====
const LS_CAMPUS = "cms_selected_campus";
const LS_ADMIN_TOKEN = "cms_admin_token";
const LS_ADMIN_EXP = "cms_admin_exp";

// ===== DOM =====
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

const topMenuBar = document.getElementById("top-menu-bar");
const menuPills = document.querySelectorAll(".menu-pill");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

const campusSelect = document.getElementById("campus-select");
const lastCampusHint = document.getElementById("last-campus-hint");

const modeBadge = document.getElementById("mode-badge");
const adminModeBtn = document.getElementById("admin-mode-btn");
const adminLogsLink = document.getElementById("admin-logs-link");

// Campus modal
const campusModal = document.getElementById("campus-modal");
const campusModalSelect = document.getElementById("campus-modal-select");
const campusSaveBtn = document.getElementById("campus-save-btn");
const campusModalClose = document.getElementById("campus-modal-close");
const campusModalMsg = document.getElementById("campus-modal-msg");

// Admin modal
const adminModal = document.getElementById("admin-modal");
const adminModalClose = document.getElementById("admin-modal-close");
const adminPinInput = document.getElementById("admin-pin-input");
const adminPinSubmit = document.getElementById("admin-pin-submit");
const adminModalError = document.getElementById("admin-modal-error");

// typing indicator
let typingBubble = null;

// ===== Helpers =====
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
  if (typingBubble && typingBubble.parentNode) typingBubble.parentNode.removeChild(typingBubble);
  typingBubble = null;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCampus() {
  return (localStorage.getItem(LS_CAMPUS) || "").trim().toUpperCase();
}

function setCampus(c) {
  const v = String(c || "").trim().toUpperCase();
  if (!v) return;
  localStorage.setItem(LS_CAMPUS, v);
  campusSelect.value = v;
  campusModalSelect.value = v;
  lastCampusHint.textContent = `Selected campus: ${v}`;
}

function openModal(modalEl) {
  modalEl.classList.remove("hidden");
}

function closeModal(modalEl) {
  modalEl.classList.add("hidden");
}

function openCampusModal(force = false) {
  const current = getCampus();
  if (!current || force) {
    campusModalMsg.textContent = "";
    openModal(campusModal);
    // try to keep select synced
    if (current) campusModalSelect.value = current;
  }
}

function adminToken() {
  const t = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  const exp = Number(localStorage.getItem(LS_ADMIN_EXP) || 0);
  if (!t || !exp) return { token: "", exp: 0, valid: false };
  if (Date.now() > exp) {
    localStorage.removeItem(LS_ADMIN_TOKEN);
    localStorage.removeItem(LS_ADMIN_EXP);
    return { token: "", exp: 0, valid: false };
  }
  return { token: t, exp, valid: true };
}

function setAdminUI(isAdmin) {
  if (isAdmin) {
    modeBadge.textContent = "MODE: ADMIN";
    modeBadge.classList.add("admin");
    adminLogsLink.classList.remove("hidden");
    adminModeBtn.textContent = "Admin Enabled";
    adminModeBtn.disabled = true;
  } else {
    modeBadge.textContent = "MODE: STAFF";
    modeBadge.classList.remove("admin");
    adminLogsLink.classList.add("hidden");
    adminModeBtn.textContent = "Admin Mode";
    adminModeBtn.disabled = false;
  }
}

function initAdminFromStorage() {
  const s = adminToken();
  setAdminUI(s.valid);
}

function showAccessErrorIfNeeded(status) {
  if (status === 401) {
    addMessage(
      "assistant",
      `<b>Access required.</b><br><br>Your session is blocked by Cloudflare Access (SSO). Please open the site again and sign in with Google.`
    );
    return true;
  }
  return false;
}

// ===== Menu panel logic =====
function openMenuPanel(type) {
  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" : type === "protocols" ? "Protocols" : "Parent Handbook";

  menuPanelBody.innerHTML = "";

  const items = MENU_ITEMS[type];

  if (!items || items.length === 0) {
    const p = document.createElement("p");
    p.textContent =
      type === "handbook"
        ? "Tip: Select your campus above, then ask handbook questions (e.g., “parent handbook arrival time”)."
        : "Content coming soon.";
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
        const qPrefix = type === "protocols" ? "Please show me the protocol: " : "Please show me the policy: ";
        askPolicy(qPrefix + item.label, true);
      });
      menuPanelBody.appendChild(btn);
    });
  }

  menuPanel.classList.remove("hidden");
  menuOverlay.classList.add("active");
}

function closeMenuPanel() {
  menuPanel.classList.add("hidden");
  menuOverlay.classList.remove("active");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

menuPills.forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.menu;
    if (btn.classList.contains("active")) closeMenuPanel();
    else openMenuPanel(type);
  });
});

menuPanelClose.addEventListener("click", closeMenuPanel);
menuOverlay.addEventListener("click", closeMenuPanel);

// ===== API calls =====
async function askPolicy(question, fromMenu = false) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;

  // Require campus? We only hard-require for handbook menu usage, but for safety we prompt if missing
  const campus = getCampus();
  if (!campus) {
    openCampusModal(true);
    addMessage("assistant", "Please select a campus first (top-right), then ask again.");
    return;
  }

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const res = await fetch(`${API_URL}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed, campus })
    });

    hideTyping();

    if (showAccessErrorIfNeeded(res.status)) return;

    if (!res.ok) {
      const errTxt = await safeReadText(res);
      addMessage("assistant", `Network error (${res.status}).<br><br>${escapeHtml(errTxt || "Please try again.")}`);
      return;
    }

    const data = await res.json();

    const title = data.policy?.title ? escapeHtml(data.policy.title) : "Answer";
    const answer = escapeHtml(data.answer || "");
    const matchReason = data.match_reason ? escapeHtml(data.match_reason) : "";

    const linkPart =
      data.policy?.link
        ? `<br><br><a href="${escapeHtml(data.policy.link)}" target="_blank" rel="noopener">Open full document</a>`
        : "";

    const metaPart = matchReason
      ? `<br><br><span class="muted" style="font-size:0.85rem">Match: ${matchReason}</span>`
      : "";

    addMessage("assistant", `<b>${title}</b><br><br>${answer}${linkPart}${metaPart}`);
  } catch (err) {
    hideTyping();
    addMessage("assistant", "Error connecting to server.");
  }
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

// ===== Chat form =====
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  userInput.value = "";
  askPolicy(q, false);
});

// ===== Campus selection =====
campusSelect.addEventListener("change", () => {
  const v = campusSelect.value;
  setCampus(v);

  // optional: reset chat on campus change
  // clearChat();

  addMessage("assistant", `Campus set to <b>${escapeHtml(v)}</b>. You can now ask handbook/policy questions.`);
});

campusSaveBtn.addEventListener("click", () => {
  const v = campusModalSelect.value;
  if (!v) {
    campusModalMsg.textContent = "Please choose a campus.";
    return;
  }
  setCampus(v);
  closeModal(campusModal);
  addMessage("assistant", `Welcome 👋 Campus selected: <b>${escapeHtml(v)}</b>. Ask any policy or handbook question.`);
});

campusModalClose.addEventListener("click", () => closeModal(campusModal));

// ===== Admin Mode =====
adminModeBtn.addEventListener("click", () => {
  adminModalError.textContent = "";
  adminPinInput.value = "";
  openModal(adminModal);
  adminPinInput.focus();
});

adminModalClose.addEventListener("click", () => closeModal(adminModal));

adminPinSubmit.addEventListener("click", enableAdminMode);
adminPinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enableAdminMode();
});

async function enableAdminMode() {
  const code = String(adminPinInput.value || "").trim();
  if (!code) {
    adminModalError.textContent = "Please enter the Admin PIN.";
    return;
  }

  adminPinSubmit.disabled = true;
  adminPinSubmit.textContent = "Enabling...";

  try {
    const res = await fetch(`${API_URL}/auth/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });

    if (showAccessErrorIfNeeded(res.status)) {
      adminPinSubmit.disabled = false;
      adminPinSubmit.textContent = "Enable";
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      adminModalError.textContent =
        data?.error || `Admin enable failed (HTTP ${res.status}).`;
      adminPinSubmit.disabled = false;
      adminPinSubmit.textContent = "Enable";
      return;
    }

    const token = String(data.admin_token || "").trim();
    const expIso = String(data.expires_at || "").trim();

    if (!token || !expIso) {
      adminModalError.textContent = "Invalid response from server.";
      adminPinSubmit.disabled = false;
      adminPinSubmit.textContent = "Enable";
      return;
    }

    const exp = Date.parse(expIso);
    if (!Number.isFinite(exp)) {
      adminModalError.textContent = "Invalid expiry time.";
      adminPinSubmit.disabled = false;
      adminPinSubmit.textContent = "Enable";
      return;
    }

    localStorage.setItem(LS_ADMIN_TOKEN, token);
    localStorage.setItem(LS_ADMIN_EXP, String(exp));

    setAdminUI(true);
    closeModal(adminModal);

    addMessage("assistant", `Admin Mode enabled ✅ (expires: <b>${escapeHtml(new Date(exp).toLocaleString())}</b>)`);
  } catch (err) {
    adminModalError.textContent = "Error connecting to server.";
  } finally {
    adminPinSubmit.disabled = false;
    adminPinSubmit.textContent = "Enable";
  }
}

// ===== Init =====
(function init() {
  // Restore campus if set
  const c = getCampus();
  if (c) {
    campusSelect.value = c;
    campusModalSelect.value = c;
    lastCampusHint.textContent = `Selected campus: ${c}`;
  } else {
    lastCampusHint.textContent = "";
  }

  // Admin mode from storage
  initAdminFromStorage();

  // First message
  clearChat();
  addMessage("assistant", "Hi 👋 Select your campus (top-right). Then ask about any CMS policy or handbook.");

  // Show campus modal if missing
  if (!c) openCampusModal(false);
})();
