// =====================================
// CMS Assistant - app.js (FULL FEATURE)
// - Staff/Parent/Admin login from first screen
// - Campus required (blank default)
// - Parent: only Parent Handbook menu
// - Staff/Admin: Policies + Protocols + Parent Handbook
// - Handbook list per campus + sections clickable
// - Admin mode badge + admin links (Dashboard/Logs)
// - Campus switch inside app + "Campus switched" message
// =====================================

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";
const API_URL = `${WORKER_BASE}/api`;
const AUTH_URLS = {
  staff: `${WORKER_BASE}/auth/staff`,
  parent: `${WORKER_BASE}/auth/parent`,
  admin: `${WORKER_BASE}/auth/admin`
};
const HANDBOOKS_URL = `${WORKER_BASE}/handbooks`; // GET ?campus=MC

const LS = {
  token: "cms_token",
  role: "cms_role",
  until: "cms_until",
  campus: "cms_selected_campus"
};

// ===== MENU ITEMS (Policies/Protocols shortcuts) =====
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
const roleSelect = document.getElementById("role-select"); // NEW in HTML
const campusSelect = document.getElementById("campus-select"); // login campus
const loginError = document.getElementById("login-error");

const headerActions = document.getElementById("header-actions");
const logoutBtn = document.getElementById("logout-btn");

const campusSwitch = document.getElementById("campus-switch"); // header campus switch
const modeBadge = document.getElementById("mode-badge");
const adminLinks = document.getElementById("admin-links");

const topMenuBar = document.getElementById("top-menu-bar");
let menuPills = document.querySelectorAll(".menu-pill");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// typing indicator
let typingBubble = null;

// ============================
// Utils
// ============================
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeCampus(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "staff" || r === "parent" || r === "admin") return r;
  return "";
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

function setSession(token, role, expiresInSec) {
  localStorage.setItem(LS.token, token);
  localStorage.setItem(LS.role, role);
  localStorage.setItem(LS.until, String(Date.now() + (expiresInSec || 28800) * 1000));
}

function clearSession() {
  localStorage.removeItem(LS.token);
  localStorage.removeItem(LS.role);
  localStorage.removeItem(LS.until);
}

function isActive() {
  const token = localStorage.getItem(LS.token);
  const until = Number(localStorage.getItem(LS.until) || "0");
  return !!token && Date.now() < until;
}

function getToken() {
  return localStorage.getItem(LS.token) || "";
}

function getRole() {
  return normalizeRole(localStorage.getItem(LS.role) || "");
}

// ============================
// UI
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

function applyRoleUI(role) {
  // Badge
  if (modeBadge) {
    modeBadge.textContent = role ? role.toUpperCase() : "GUEST";
    modeBadge.classList.remove("staff", "parent", "admin");
    if (role) modeBadge.classList.add(role);
  }

  // Admin links show only for admin
  if (adminLinks) {
    if (role === "admin") adminLinks.classList.remove("hidden");
    else adminLinks.classList.add("hidden");
  }

  // Menu pills: parent can only see handbook
  menuPills = document.querySelectorAll(".menu-pill");
  menuPills.forEach((btn) => {
    const type = btn.dataset.menu;
    if (role === "parent") {
      btn.style.display = type === "handbook" ? "inline-flex" : "none";
    } else {
      btn.style.display = "inline-flex";
    }
  });
}

function showLoginUI() {
  closeMenuPanel();

  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  headerActions.classList.add("hidden");
  topMenuBar.classList.add("hidden");

  // blank campus on login (required)
  if (!getCampus()) setCampus("");

  // clear badge look
  applyRoleUI("");
}

function showChatUI() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  headerActions.classList.remove("hidden");
  topMenuBar.classList.remove("hidden");

  applyRoleUI(getRole());
}

// ============================
// LOGIN
// ============================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  loginError.textContent = "";

  const role = normalizeRole(roleSelect?.value);
  const campus = normalizeCampus(campusSelect?.value);
  const codeOrPin = (accessCodeInput.value || "").trim();

  if (!role) {
    loginError.textContent = "Please select role (staff / parent / admin).";
    return;
  }
  if (!campus) {
    loginError.textContent = "Please select a campus.";
    return;
  }
  if (!codeOrPin) {
    loginError.textContent = "Please enter access code.";
    return;
  }

  try {
    const payload = role === "admin" ? { pin: codeOrPin } : { code: codeOrPin };

    const res = await fetch(AUTH_URLS[role], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      loginError.textContent = data.error || "Invalid code.";
      return;
    }

    setSession(data.token, data.role || role, data.expires_in || 28800);
    setCampus(campus);

    accessCodeInput.value = "";

    showChatUI();
    clearChat();

    addMessage(
      "assistant",
      `✅ Signed in as <b>${escapeHtml(getRole())}</b><br>
       Campus: <b>${escapeHtml(getCampus())}</b><br><br>
       ${getRole() === "parent"
         ? "You can browse Parent Handbooks (campus-based) and ask handbook questions."
         : "Ask about any policy, protocol, or parent handbook for this campus."}`
    );
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
  clearSession();

  accessCodeInput.value = "";
  loginError.textContent = "";

  // keep campus remembered? -> you wanted blank default, so clear it:
  setCampus("");

  showLoginUI();
});

// ============================
// CAMPUS SWITCH (inside app)
// ============================
if (campusSwitch) {
  campusSwitch.addEventListener("change", () => {
    const c = normalizeCampus(campusSwitch.value);
    if (!c) return;

    setCampus(c);
    addMessage("assistant", `✅ Campus switched to <b>${escapeHtml(getCampus())}</b>.`);
  });
}

// ============================
// MENU PANEL
// ============================
menuPanelClose?.addEventListener("click", closeMenuPanel);
menuOverlay?.addEventListener("click", closeMenuPanel);

menuPills.forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.menu;
    if (btn.classList.contains("active")) closeMenuPanel();
    else openMenuPanel(type);
  });
});

function setActivePill(type) {
  menuPills.forEach((btn) => btn.classList.toggle("active", btn.dataset.menu === type));
}

function openMenuPanel(type) {
  setActivePill(type);

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbooks";

  menuPanelBody.innerHTML = "";

  if (type === "handbook") {
    renderHandbooks();
  } else {
    renderPolicyProtocolList(type);
  }

  menuPanel.classList.remove("hidden");
  menuOverlay.classList.remove("hidden");
}

function closeMenuPanel() {
  menuPanel.classList.add("hidden");
  menuOverlay.classList.add("hidden");
  menuPills.forEach((btn) => btn.classList.remove("active"));
}

function renderPolicyProtocolList(type) {
  const items = MENU_ITEMS[type] || [];

  const label = document.createElement("div");
  label.className = "menu-group-label";
  label.textContent = "Tap an item to ask the assistant";
  menuPanelBody.appendChild(label);

  items.forEach((item) => {
    const b = document.createElement("button");
    b.className = "menu-item-btn";
    b.textContent = item.label;
    b.onclick = () => {
      closeMenuPanel();
      const prefix = type === "protocols" ? "Please show me the protocol: " : "Please show me the policy: ";
      ask(prefix + item.label);
    };
    menuPanelBody.appendChild(b);
  });
}

// ============================
// Handbooks (list + sections clickable)
// Requires Worker: GET /handbooks?campus=MC
// ============================
async function renderHandbooks() {
  const campus = getCampus();
  if (!campus) {
    const p = document.createElement("p");
    p.className = "helper-text";
    p.textContent = "Please select a campus first.";
    menuPanelBody.appendChild(p);
    return;
  }

  const loading = document.createElement("div");
  loading.className = "menu-group-label";
  loading.textContent = "Loading handbooks…";
  menuPanelBody.appendChild(loading);

  try {
    const res = await fetch(`${HANDBOOKS_URL}?campus=${encodeURIComponent(campus)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json().catch(() => ({}));

    menuPanelBody.innerHTML = "";

    if (!res.ok) {
      const p = document.createElement("p");
      p.className = "helper-text";
      p.textContent = data.error || "Could not load handbooks.";
      menuPanelBody.appendChild(p);
      return;
    }

    const handbooks = Array.isArray(data.handbooks) ? data.handbooks : [];
    if (!handbooks.length) {
      const p = document.createElement("p");
      p.className = "helper-text";
      p.textContent = "No handbooks found for this campus yet.";
      menuPanelBody.appendChild(p);
      return;
    }

    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = `Handbooks for ${campus} (tap one)`;
    menuPanelBody.appendChild(label);

    handbooks.forEach((hb) => {
      const b = document.createElement("button");
      b.className = "menu-item-btn";
      b.innerHTML = `<b>${escapeHtml(hb.title || "Handbook")}</b><br>
        <span style="font-size:12px;color:#6b7280;">
          ${escapeHtml(hb.program || "")}
        </span>`;
      b.onclick = () => renderHandbookSections(hb);
      menuPanelBody.appendChild(b);
    });
  } catch (e) {
    menuPanelBody.innerHTML = "";
    const p = document.createElement("p");
    p.className = "helper-text";
    p.textContent = "Network error while loading handbooks.";
    menuPanelBody.appendChild(p);
  }
}

function renderHandbookSections(hb) {
  menuPanelBody.innerHTML = "";

  const top = document.createElement("div");
  top.className = "menu-group-label";
  top.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div>
        <b>${escapeHtml(hb.title || "Handbook")}</b><br>
        <span style="font-size:12px;color:#6b7280;">${escapeHtml(hb.program || "")}</span>
      </div>
      <button class="secondary-btn" type="button" id="hb-back-btn">Back</button>
    </div>
  `;
  menuPanelBody.appendChild(top);

  // Back button
  const backBtn = top.querySelector("#hb-back-btn");
  backBtn.onclick = () => renderHandbooks();

  // Optional "open full doc" link
  if (hb.link) {
    const a = document.createElement("a");
    a.href = hb.link;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "hb-open-link";
    a.textContent = "Open full handbook";
    menuPanelBody.appendChild(a);
  }

  const sections = Array.isArray(hb.sections) ? hb.sections : [];
  if (!sections.length) {
    const p = document.createElement("p");
    p.className = "helper-text";
    p.textContent = "No sections found in this handbook yet.";
    menuPanelBody.appendChild(p);
    return;
  }

  const label = document.createElement("div");
  label.className = "menu-group-label";
  label.textContent = "Sections (tap one)";
  menuPanelBody.appendChild(label);

  sections.forEach((s) => {
    const b = document.createElement("button");
    b.className = "menu-item-btn";
    b.textContent = s.title || s.key || "Section";
    b.onclick = () => {
      closeMenuPanel();
      // Ask question in a clean way (no extra prompt noise)
      ask(`In the parent handbook, what does it say about "${s.title || s.key}"?`);
    };
    menuPanelBody.appendChild(b);
  });
}

// ============================
// CHAT / API
// ============================
async function ask(question) {
  if (!isActive()) {
    addMessage("assistant", "Session expired. Please login again.");
    showLoginUI();
    return;
  }

  const campus = getCampus();
  if (!campus) {
    addMessage("assistant", "Please select a campus first.");
    return;
  }

  const text = String(question || "").trim();
  if (!text) return;

  addMessage("user", escapeHtml(text));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ query: text, campus })
    });

    hideTyping();

    if (res.status === 429) {
      addMessage("assistant", "Too many requests. Please wait a moment and try again.");
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      addMessage("assistant", escapeHtml(data.error || "Unauthorized. Please login again."));
      clearSession();
      showLoginUI();
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
  const q = (userInput.value || "").trim();
  if (!q) return;
  userInput.value = "";
  ask(q);
});


function $(id){ return document.getElementById(id); }

document.addEventListener("DOMContentLoaded", () => {
  // --- Admin button wiring ---
  const adminBtn = $("adminBtn");
  const adminModal = $("adminModal");
  const adminCancel = $("adminCancel");
  const adminSubmit = $("adminSubmit");

  if (adminBtn && adminModal) {
    adminBtn.addEventListener("click", () => {
      adminModal.classList.remove("hidden");
      $("adminError") && ($("adminError").textContent = "");
      $("adminPin") && ($("adminPin").value = "");
      setTimeout(() => $("adminPin")?.focus(), 50);
    });
  }

  adminCancel?.addEventListener("click", () => {
    adminModal.classList.add("hidden");
  });

  adminSubmit?.addEventListener("click", async () => {
    const pin = ($("adminPin")?.value || "").trim();
    if (!pin) {
      if ($("adminError")) $("adminError").textContent = "Enter admin PIN";
      return;
    }
    // اینجا باید همون endpoint قبلی خودت باشه:
    // POST /auth/admin { pin }
    try {
      const r = await fetch(`${API_BASE}/auth/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "Admin login failed");

      localStorage.setItem("cms_admin_token", data.token);
      adminModal.classList.add("hidden");

      // اگر میخوای همونجا Admin Mode فعال شه:
      localStorage.setItem("cms_admin_mode", "1");
      location.reload();

    } catch (e) {
      if ($("adminError")) $("adminError").textContent = e.message;
    }
  });
});
// ============================
// INIT
// ============================
(function init() {
  // Default campus blank
  if (!getCampus()) setCampus("");

  // clean expired
  if (!isActive()) {
    clearSession();
  }

  if (isActive()) {
    showChatUI();
    clearChat();
    addMessage(
      "assistant",
      `Welcome back 👋<br>
       Role: <b>${escapeHtml(getRole())}</b><br>
       Campus: <b>${escapeHtml(getCampus() || "(not selected)")}</b>`
    );
  } else {
    showLoginUI();
  }
})();