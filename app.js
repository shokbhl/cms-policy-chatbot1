// =========================
// CONFIG
// =========================
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";
const STAFF_CODE = "cms-staff-2025";

// =========================
// MENU LISTS
// =========================
const MENU_ITEMS = {
  policies: [
    "Safe Arrival & Dismissal",
    "Playground Safety",
    "Anaphylaxis Policy",
    "Medication Administration",
    "Emergency Management",
    "Sleep Supervision (Toddlers & Preschool)",
    "Sleep Supervision (Infants)",
    "Supervision of Students & Volunteers",
    "Behaviour Management Monitoring",
    "Fire Safety",
  ],
  protocols: [
    "Serious Occurrence Protocol",
    "Sleep Protocol (Toddlers & Preschool)",
    "Sleep Protocol (Infants)",
  ],
};

// =========================
// DOM ELEMENTS
// =========================
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

const tabBar = document.getElementById("tab-bar");
const tabPolicies = document.getElementById("tab-policies");
const tabProtocols = document.getElementById("tab-protocols");
const tabHandbook = document.getElementById("tab-handbook");

const listPolicies = document.getElementById("list-policies");
const listProtocols = document.getElementById("list-protocols");
const listHandbook = document.getElementById("list-handbook");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

const logoutBtn = document.getElementById("logout-btn");

let typingBubble = null;

// =========================
// HELPERS
// =========================

// Show messages EXACTLY like WhatsApp (always vertically stacked)
function addMessage(role, html) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = html;
  chatWindow.appendChild(msg);

  // force ALWAYS one-per-line
  msg.style.display = "block";
  msg.style.clear = "both";

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearChat() {
  chatWindow.innerHTML = "";
}

// Typing animation
function showTyping() {
  hideTyping();
  const wrap = document.createElement("div");
  wrap.className = "typing-bubble";

  wrap.innerHTML = `
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;

  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  typingBubble = wrap;
}

function hideTyping() {
  if (typingBubble) typingBubble.remove();
  typingBubble = null;
}

// =========================
// LOGIN SYSTEM
// =========================
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === STAFF_CODE) {
    loginError.textContent = "";

    // Switch screens
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    // Show tab bar
    tabBar.classList.remove("hidden");

    // Clear old chat
    clearChat();

    addMessage("assistant", "Welcome 👋 How can I help you today?");
  } else {
    loginError.textContent = "Incorrect code.";
  }
});

// =========================
// LOGOUT
// =========================
logoutBtn.addEventListener("click", () => {

  // Hide chat, show login
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  // Hide tabs
  tabBar.classList.add("hidden");

  // Reset chat
  clearChat();

  // Reset code box
  accessCodeInput.value = "";
});

// =========================
// POPULATE MENU
// =========================
function fillMenu(listEl, items) {
  listEl.innerHTML = "";
  items.forEach((label) => {
    const btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.textContent = label;

    btn.addEventListener("click", () => {
      askPolicy(`Show me: ${label}`);
    });

    listEl.appendChild(btn);
  });
}

fillMenu(listPolicies, MENU_ITEMS.policies);
fillMenu(listProtocols, MENU_ITEMS.protocols);

// handbook (coming soon)
listHandbook.innerHTML = `<li class="coming">Coming soon…</li>`;

// =========================
// TAB SWITCHING
// =========================
function activateTab(tabName) {
  tabPolicies.classList.remove("active");
  tabProtocols.classList.remove("active");
  tabHandbook.classList.remove("active");

  listPolicies.classList.add("hidden");
  listProtocols.classList.add("hidden");
  listHandbook.classList.add("hidden");

  if (tabName === "policies") {
    tabPolicies.classList.add("active");
    listPolicies.classList.remove("hidden");
  }
  if (tabName === "protocols") {
    tabProtocols.classList.add("active");
    listProtocols.classList.remove("hidden");
  }
  if (tabName === "handbook") {
    tabHandbook.classList.add("active");
    listHandbook.classList.remove("hidden");
  }
}

tabPolicies.addEventListener("click", () => activateTab("policies"));
tabProtocols.addEventListener("click", () => activateTab("protocols"));
tabHandbook.addEventListener("click", () => activateTab("handbook"));

// default
activateTab("policies");

// =========================
// CHAT API
// =========================
async function askPolicy(question) {
  const q = question.trim();
  if (!q) return;

  addMessage("user", q);
  showTyping();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });

    hideTyping();

    if (!response.ok) {
      addMessage("assistant", "Network error — please try again.");
      return;
    }

    const data = await response.json();

    addMessage(
      "assistant",
      `<b>${data.policy?.title || "Policy"}</b><br><br>${data.answer || ""}${
        data.policy?.link
          ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`
          : ""
      }`
    );
  } catch (err) {
    hideTyping();
    addMessage("assistant", "Server unreachable.");
  }
}

// Send form
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value;
  userInput.value = "";
  askPolicy(q);
});