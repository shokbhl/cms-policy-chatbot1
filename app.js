// CONFIG
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";
const STAFF_CODE = "cms-staff-2025";

// MENU ITEMS
const MENU_ITEMS = {
  policies: [
    { id: "safe_arrival", label: "Safe Arrival & Dismissal" },
    { id: "playground_safety", label: "Playground Safety" },
    { id: "anaphylaxis_policy", label: "Anaphylaxis Policy" },
    { id: "medication_administration", label: "Medication Administration" },
    { id: "emergency_management", label: "Emergency Management" }
  ],
  protocols: [
    { id: "serious_occurrence", label: "Serious Occurrence" },
    { id: "sleep_toddlers", label: "Sleep (Toddler & Preschool)" },
    { id: "sleep_infants", label: "Sleep (Infants)" }
  ]
};

// DOM
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

const topActions = document.getElementById("top-actions");
const logoutBtn = document.getElementById("logout-btn");
const menuToggle = document.getElementById("menu-toggle");

const sideMenu = document.getElementById("side-menu");
const overlay = document.getElementById("overlay");
const closeMenuBtn = document.getElementById("close-menu");
const policyListEl = document.getElementById("policy-list");
const protocolListEl = document.getElementById("protocol-list");

let typingBubble = null;

// HELPERS
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearChat() {
  chatWindow.innerHTML = "";
}

// Typing bubbles
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
  if (typingBubble) typingBubble.remove();
  typingBubble = null;
}

// LOGIN
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === STAFF_CODE) {
    loginError.textContent = "";
    accessCodeInput.value = "";

    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    topActions.classList.remove("hidden");

    clearChat();

    addMessage("assistant", "Hi 👋 Ask me about any CMS policy or open the menu.");

  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// LOGOUT
logoutBtn.addEventListener("click", () => {
  closeMenu();
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  topActions.classList.add("hidden");
  clearChat();
  accessCodeInput.value = "";
});

// MENU
function openMenu() {
  sideMenu.classList.remove("hidden");

  requestAnimationFrame(() => {
    sideMenu.classList.add("open");
    overlay.classList.add("active");
  });
}

function closeMenu() {
  sideMenu.classList.remove("open");
  overlay.classList.remove("active");
  setTimeout(() => {
    if (!sideMenu.classList.contains("open")) {
      sideMenu.classList.add("hidden");
    }
  }, 250);
}

menuToggle.addEventListener("click", () => {
  if (sideMenu.classList.contains("hidden")) openMenu();
  else closeMenu();
});

closeMenuBtn.addEventListener("click", closeMenu);
overlay.addEventListener("click", closeMenu);

// Populate menu
function populateMenu() {
  policyListEl.innerHTML = "";
  protocolListEl.innerHTML = "";

  MENU_ITEMS.policies.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.textContent = item.label;

    btn.addEventListener("click", () => {
      closeMenu();
      askPolicy(`Show me the policy: ${item.label}`);
    });

    policyListEl.appendChild(btn);
  });

  MENU_ITEMS.protocols.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.textContent = item.label;

    btn.addEventListener("click", () => {
      closeMenu();
      askPolicy(`Show me the protocol: ${item.label}`);
    });

    protocolListEl.appendChild(btn);
  });
}

populateMenu();

// CHAT LOGIC
async function askPolicy(question) {
  addMessage("user", question);

  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question })
    });

    hideTyping();

    if (!res.ok) {
      addMessage("assistant", "Network error — please try again.");
      return;
    }

    const data = await res.json();

    addMessage(
      "assistant",
      `<b>${data.policy?.title || "Policy found:"}</b><br><br>${data.answer || ""}<br><br>
      ${data.policy?.link ? `<a href="${data.policy.link}" target="_blank">Open full policy</a>` : ""}`
    );

  } catch {
    hideTyping();
    addMessage("assistant", "Error connecting to server.");
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  userInput.value = "";
  askPolicy(q);
});