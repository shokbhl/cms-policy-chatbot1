// ===== CONFIG =====
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

// ✅ Access Codes
const STAFF_CODE = "cms-staff-2025";
const ADMIN_CODE = "cms-admin-2025"; // ← اگر کد ادمینت فرق داره همینو عوض کن

// ✅ Campus options
const CAMPUSES = [
  { id: "MC", label: "Maplehurst (MC)" },
  { id: "SC", label: "Senior Casa (SC)" },
  { id: "TC", label: "Toddler Casa (TC)" },
  { id: "WC", label: "Willowdale (WC)" },
  { id: "YC", label: "York Mills (YC)" }
];

// منوها
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
    // ✅ Campus-based handbook (we’ll render a campus picker + one button)
    // اینجا خالی می‌مونه و در openMenuPanel پر می‌شه
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

const topMenuBar = document.getElementById("top-menu-bar");
const menuPills = document.querySelectorAll(".menu-pill");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

// ✅ new UI hooks (from HTML changes)
const campusBadge = document.getElementById("campus-badge"); // span
const adminLogsBtn = document.getElementById("admin-logs-btn"); // a

// typing indicator
let typingBubble = null;

// ===== SESSION (localStorage) =====
const LS_ROLE = "cms_role";     // staff | admin
const LS_CAMPUS = "cms_campus"; // MC | SC | TC | WC | YC

function setRole(role) {
  localStorage.setItem(LS_ROLE, role);
}
function getRole() {
  return localStorage.getItem(LS_ROLE) || "staff";
}
function setCampus(campus) {
  localStorage.setItem(LS_CAMPUS, campus);
}
function getCampus() {
  return localStorage.getItem(LS_CAMPUS) || "";
}

function isValidCampus(code) {
  return CAMPUSES.some((c) => c.id === code);
}

// ===== HELPERS =====
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

// typing indicator
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

// ===== CAMPUS + ROLE UI =====
function updateCampusBadge() {
  if (!campusBadge) return;
  const c = getCampus();
  campusBadge.textContent = c ? `Campus: ${c}` : "Campus: —";
}

function updateAdminUI() {
  if (!adminLogsBtn) return;
  const role = getRole();
  if (role === "admin") {
    adminLogsBtn.classList.remove("hidden");
  } else {
    adminLogsBtn.classList.add("hidden");
  }
}

/**
 * Simple campus picker (no extra HTML needed)
 * If campus missing or invalid, force user to pick.
 */
function ensureCampusSelected(force = false) {
  let c = getCampus();
  if (!force && isValidCampus(c)) return c;

  const options = CAMPUSES.map((x) => x.id).join(", ");
  const choice = prompt(
    `Select your campus code (${options})\nExample: MC`,
    c || "MC"
  );

  const normalized = (choice || "").trim().toUpperCase();
  if (isValidCampus(normalized)) {
    setCampus(normalized);
    updateCampusBadge();
    return normalized;
  }

  // if invalid, keep asking once more
  const choice2 = prompt(
    `Invalid campus. Please enter one of: ${options}`,
    "MC"
  );
  const normalized2 = (choice2 || "").trim().toUpperCase();
  if (isValidCampus(normalized2)) {
    setCampus(normalized2);
    updateCampusBadge();
    return normalized2;
  }

  // fallback
  setCampus("MC");
  updateCampusBadge();
  return "MC";
}

// ===== LOGIN / LOGOUT =====
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === STAFF_CODE || code === ADMIN_CODE) {
    loginError.textContent = "";
    accessCodeInput.value = "";

    // ✅ set role
    const role = code === ADMIN_CODE ? "admin" : "staff";
    setRole(role);

    // ✅ ensure campus
    ensureCampusSelected(false);

    // show chat
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    // show logout + menu
    headerActions.classList.remove("hidden");
    topMenuBar.classList.remove("hidden");

    // update UI
    updateCampusBadge();
    updateAdminUI();

    clearChat();
    addMessage(
      "assistant",
      `Hi 👋 You can ask about any CMS policy or use the menu above.<br><br>
       <b>Role:</b> ${role} · <b>Campus:</b> ${getCampus()}`
    );
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

logoutBtn.addEventListener("click", () => {
  closeMenuPanel();

  // back to login
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  headerActions.classList.add("hidden");
  topMenuBar.classList.add("hidden");

  clearChat();
  accessCodeInput.value = "";

  // optional: keep campus/role saved; or clear:
  // localStorage.removeItem(LS_ROLE);
  // localStorage.removeItem(LS_CAMPUS);
});

// ===== MENU PANEL LOGIC =====
function openMenuPanel(type) {
  menuPills.forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.menu === type)
  );

  menuPanelTitle.textContent =
    type === "policies"
      ? "Policies"
      : type === "protocols"
      ? "Protocols"
      : "Parent Handbook";

  menuPanelBody.innerHTML = "";

  // ✅ Special handling for handbook (campus based)
  if (type === "handbook") {
    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = "Select campus and view handbook";
    menuPanelBody.appendChild(label);

    // campus select
    const select = document.createElement("select");
    select.style.width = "100%";
    select.style.padding = "10px 12px";
    select.style.borderRadius = "12px";
    select.style.border = "1px solid var(--cms-border)";
    select.style.background = "#fff";
    select.style.marginBottom = "10px";

    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "Choose campus…";
    select.appendChild(optAll);

    CAMPUSES.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label;
      select.appendChild(opt);
    });

    const current = getCampus();
    select.value = current || "";

    select.addEventListener("change", () => {
      const v = (select.value || "").toUpperCase();
      if (isValidCampus(v)) {
        setCampus(v);
        updateCampusBadge();
      }
    });

    menuPanelBody.appendChild(select);

    // view button
    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.textContent = "Open Parent Handbook";
    btn.addEventListener("click", () => {
      const c = ensureCampusSelected(false);
      closeMenuPanel();
      // send a clear request; worker can use campus field too
      askPolicy(`Please show me the Parent Handbook for campus ${c}.`, true);
    });

    menuPanelBody.appendChild(btn);

    // optional: switch campus
    const small = document.createElement("button");
    small.className = "menu-item-btn";
    small.textContent = "Change Campus";
    small.addEventListener("click", () => {
      ensureCampusSelected(true);
      select.value = getCampus();
    });
    menuPanelBody.appendChild(small);

    menuPanel.classList.remove("hidden");
    menuOverlay.classList.add("active");
    return;
  }

  // Normal policies/protocols
  const items = MENU_ITEMS[type];

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

    if (btn.classList.contains("active")) {
      closeMenuPanel();
    } else {
      openMenuPanel(type);
    }
  });
});

menuPanelClose.addEventListener("click", closeMenuPanel);
menuOverlay.addEventListener("click", closeMenuPanel);

// ===== CHAT / API =====
async function askPolicy(question, fromMenu = false) {
  const trimmed = question.trim();
  if (!trimmed) return;

  addMessage("user", trimmed);
  showTyping();

  // ✅ attach campus + role
  const campus = ensureCampusSelected(false);
  const role = getRole();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: trimmed,
        campus,
        role
      })
    });

    hideTyping();

    if (!res.ok) {
      addMessage("assistant", "Network error — please try again.");
      return;
    }

    const data = await res.json();

    const title = data.policy?.title || "Result:";
    const answer = data.answer || "";

    const linkPart = data.policy?.link
      ? `<br><br><a href="${data.policy.link}" target="_blank">Open full document</a>`
      : "";

    addMessage("assistant", `<b>${title}</b><br><br>${answer}${linkPart}`);
  } catch (err) {
    hideTyping();
    addMessage("assistant", "Error connecting to server.");
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  userInput.value = "";
  askPolicy(q, false);
});

// ✅ initial UI state (badge/admin btn)
updateCampusBadge();
updateAdminUI();
