// ===== CONFIG =====
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";
const STAFF_CODE = "cms-staff-2025";

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
  handbook: [
    // فعلاً خالی – فقط پیام Coming soon نمایش می‌دهیم
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

// برای تایپینگ
let typingBubble = null;

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

// ===== LOGIN / LOGOUT =====
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === STAFF_CODE) {
    loginError.textContent = "";
    accessCodeInput.value = "";

    // نمایش چت
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    // نمایش logout + منو بالا
    headerActions.classList.remove("hidden");
    topMenuBar.classList.remove("hidden");

    clearChat();
    addMessage(
      "assistant",
      "Hi 👋 You can ask about any CMS policy or use the menu above to jump to a specific policy."
    );
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

logoutBtn.addEventListener("click", () => {
  // بستن پنل منو
  closeMenuPanel();

  // برگشت به لاگین
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  headerActions.classList.add("hidden");
  topMenuBar.classList.add("hidden");

  clearChat();
  accessCodeInput.value = "";
});

// ===== MENU PANEL LOGIC =====
function openMenuPanel(type) {
  // فعال کردن استیت ظاهری دکمه‌ها
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
    // اگر تکراری کلیک شد، ببندیم
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

  // پیام کاربر – همیشه زیر پیام قبلی
  addMessage("user", trimmed);

  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed })
    });

    hideTyping();

    if (!res.ok) {
      addMessage("assistant", "Network error — please try again.");
      return;
    }

    const data = await res.json();

    const title = data.policy?.title || "Policy found:";
    const answer = data.answer || "";

    const linkPart = data.policy?.link
      ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`
      : "";

    addMessage(
      "assistant",
      `<b>${title}</b><br><br>${answer}${linkPart}`
    );
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