// app.js (REPLACE ENTIRE FILE)

// ===== CONFIG =====
const API_BASE = "https://cms-policy-chatbot-v2.shokbhl.workers.dev";
const LOGIN_URL = `${API_BASE}/auth/login`;   // ✅ FIX
const API_URL = `${API_BASE}/api`;

// ===== MENUS =====
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
    { id: "program_statement1", label: "CMS Program Statement and Implementation" },
    { id: "non_discrimination", label: "Non-Discrimination / Anti-Racism Policy" },
    { id: "safety_security", label: "Safety & Security" },
    { id: "start_school_year", label: "Start of the New School Year" },
    { id: "employee_conduct", label: "Employee Protocol / Conduct" },
    { id: "classroom_management", label: "Classroom Management & Routines" },
    { id: "caring_students", label: "Caring for Our Students" },
    { id: "afterschool_routines", label: "Afterschool Routines & Extracurricular Activities" },
    { id: "special_events", label: "Special Events" },
    { id: "reports_forms", label: "Reports & Forms" },
    { id: "other", label: "other" },
    { id: "closing", label: "In closing" }
  ],
  handbook: []
};

// ===== DOM (matches your HTML) =====
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");

const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const campusSelect = document.getElementById("campus");
const loginError = document.getElementById("login-error");

const topActions = document.getElementById("top-actions");     // ✅ in your HTML
const campusPill = document.getElementById("campus-pill");     // ✅ in your HTML
const logoutBtn = document.getElementById("logout-btn");

const menuPills = document.querySelectorAll(".menu-pill");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

const menuPanel = document.getElementById("menu-panel");
const menuPanelTitle = document.getElementById("menu-panel-title");
const menuPanelBody = document.getElementById("menu-panel-body");
const menuPanelClose = document.getElementById("menu-panel-close");
const menuOverlay = document.getElementById("menu-overlay");

let typingBubble = null;

// ===== SESSION =====
function getSession() {
  try {
    return JSON.parse(localStorage.getItem("cms_session") || "null");
  } catch {
    return null;
  }
}
function setSession(s) {
  localStorage.setItem("cms_session", JSON.stringify(s));
}
function clearSession() {
  localStorage.removeItem("cms_session");
}

// ===== UI HELPERS =====
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
  if (typingBubble && typingBubble.parentNode) {
    typingBubble.parentNode.removeChild(typingBubble);
  }
  typingBubble = null;
}

function showChatUI(campus) {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  topActions.classList.remove("hidden");

  campusPill.textContent = `Campus: ${campus}`;

  clearChat();
  addMessage(
    "assistant",
    "Hi 👋 You can ask about any CMS policy/protocol. Use the menu for quick access, or open your campus Parent Handbook."
  );
}

function showLoginUI() {
  closeMenuPanel();

  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  topActions.classList.add("hidden");

  clearChat();

  loginError.classList.add("hidden");
  loginError.textContent = "";
  usernameInput.value = "";
  passwordInput.value = "";
  campusSelect.value = "";
}

// ===== AUTH =====
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  loginError.classList.add("hidden");
  loginError.textContent = "";

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const campus = (campusSelect.value || "").trim().toUpperCase();

  if (!username || !password || !campus) {
    loginError.textContent = "Please enter username, password, and campus.";
    loginError.classList.remove("hidden");
    return;
  }

  try {
    const res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, campus })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      loginError.textContent = data.error || "Login failed.";
      loginError.classList.remove("hidden");
      return;
    }

    // ✅ Worker returns: { ok, token, role, campus }
    setSession({
      token: data.token,
      username,
      role: data.role,
      campus: data.campus
    });

    showChatUI(data.campus);
  } catch {
    loginError.textContent = "Network error. Please try again.";
    loginError.classList.remove("hidden");
  }
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  showLoginUI();
});

// Auto-restore session
(function boot() {
  const s = getSession();
  if (s?.token && s?.campus) showChatUI(s.campus);
  else showLoginUI();
})();

// ===== MENU PANEL =====
function openMenuPanel(type) {
  menuPills.forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.menu === type)
  );

  menuPanelTitle.textContent =
    type === "policies" ? "Policies" :
    type === "protocols" ? "Protocols" :
    "Parent Handbook";

  menuPanelBody.innerHTML = "";

  const s = getSession();
  const campus = s?.campus || "";

  if (type === "handbook") {
    const label = document.createElement("div");
    label.className = "menu-group-label";
    label.textContent = campus ? `Your campus: ${campus}` : "Login required";
    menuPanelBody.appendChild(label);

    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.textContent = campus ? `Open Parent Handbook — ${campus}` : "Please login first";
    btn.disabled = !campus;

    btn.addEventListener("click", () => {
      closeMenuPanel();
      askPolicy(`Please show me the parent handbook for campus ${campus}.`);
    });

    menuPanelBody.appendChild(btn);

    const hint = document.createElement("p");
    hint.style.fontSize = "0.9rem";
    hint.style.color = "#6b7280";
    hint.style.margin = "6px 2px 0";
    hint.textContent = "You can also ask questions about the handbook (fees, hours, etc.).";
    menuPanelBody.appendChild(hint);
  } else {
    const items = MENU_ITEMS[type] || [];

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
        askPolicy(qPrefix + item.label);
      });
      menuPanelBody.appendChild(btn);
    });
  }

  menuPanel.classList.remove("hidden");
  menuOverlay.classList.remove("hidden");
  menuOverlay.classList.add("active");
}

function closeMenuPanel() {
  menuPanel.classList.add("hidden");
  menuOverlay.classList.remove("active");
  menuOverlay.classList.add("hidden");
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

// ===== CHAT =====
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  userInput.value = "";
  askPolicy(q);
});

async function askPolicy(question) {
  const trimmed = question.trim();
  if (!trimmed) return;

  const s = getSession();
  if (!s?.token) {
    addMessage("assistant", "Please login first.");
    return;
  }

  addMessage("user", escapeHtml(trimmed));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${s.token}`
      },
      // You CAN also send campus, but worker already uses token.sel.
      body: JSON.stringify({ query: trimmed })
    });

    const data = await res.json().catch(() => ({}));
    hideTyping();

    if (!res.ok) {
      const msg = data.error || "Something went wrong. Please try again.";
      addMessage("assistant", escapeHtml(msg));
      if (res.status === 401) {
        clearSession();
        addMessage("assistant", "Session expired. Please login again.");
        showLoginUI();
      }
      return;
    }

    const docTitle = data.policy?.title || "Result";
    const docSource = data.policy?.source ? ` <span class="muted">(from ${escapeHtml(data.policy.source)})</span>` : "";
    const answer = data.answer || "";

    const linkPart = data.policy?.link
      ? `<br><br><a href="${data.policy.link}" target="_blank" rel="noopener">Open full document</a>`
      : "";

    addMessage(
      "assistant",
      `<b>${escapeHtml(docTitle)}</b>${docSource}<br><br>${escapeHtml(answer)}${linkPart}`
    );
  } catch {
    hideTyping();
    addMessage("assistant", "Network error — please try again.");
  }
}

// Prevent HTML injection
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
