// =============================
// CONFIG
// =============================
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";
const STAFF_CODE = "cms-staff-2025";

// MENU DATA
const MENU_ITEMS = {
  policies: [
    "Safe Arrival & Dismissal",
    "Playground Safety",
    "Anaphylaxis Policy",
    "Medication Administration",
    "Emergency Management"
  ],
  protocols: [
    "Serious Occurrence",
    "Sleep Supervision (Toddler & Preschool)",
    "Sleep Supervision (Infants)"
  ]
};

// =============================
// DOM
// =============================
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

const topNav = document.getElementById("top-nav");
const logoutBtn = document.getElementById("logout-btn");

const policyDropdown = document.getElementById("policy-dropdown");
const protocolDropdown = document.getElementById("protocol-dropdown");
const handbookDropdown = document.getElementById("handbook-dropdown");

let typingBubble = null;

// =============================
// HELPERS
// =============================

// Add message bubble
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = text;
  chatWindow.appendChild(msg);

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Typing bubble
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

function clearChat() {
  chatWindow.innerHTML = "";
}

// =============================
// LOGIN
// =============================
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === STAFF_CODE) {
    loginError.textContent = "";
    accessCodeInput.value = "";

    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    topNav.classList.remove("hidden");

    clearChat();

    addMessage("assistant", "Hi 👋 Ask me about any CMS policy, or use the menu above.");

  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// =============================
// LOGOUT
// =============================
logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  topNav.classList.add("hidden");

  clearChat();
  accessCodeInput.value = "";
});

// =============================
// POPULATE TOP-DROP MENUS
// =============================
function fillMenus() {
  MENU_ITEMS.policies.forEach((label) => {
    const btn = document.createElement("button");
    btn.className = "dropdown-item";
    btn.textContent = label;
    btn.onclick = () => askPolicy(`Show me the policy: ${label}`);
    policyDropdown.appendChild(btn);
  });

  MENU_ITEMS.protocols.forEach((label) => {
    const btn = document.createElement("button");
    btn.className = "dropdown-item";
    btn.textContent = label;
    btn.onclick = () => askPolicy(`Show me the protocol: ${label}`);
    protocolDropdown.appendChild(btn);
  });
}
fillMenus();

// =============================
// DROPDOWN MENU LOGIC
// =============================
function toggleDropdown(el) {
  el.classList.toggle("open");
}

document.getElementById("policy-tab").onclick = () => {
  toggleDropdown(policyDropdown);
  protocolDropdown.classList.remove("open");
  handbookDropdown.classList.remove("open");
};

document.getElementById("protocol-tab").onclick = () => {
  toggleDropdown(protocolDropdown);
  policyDropdown.classList.remove("open");
  handbookDropdown.classList.remove("open");
};

document.getElementById("handbook-tab").onclick = () => {
  toggleDropdown(handbookDropdown);
  policyDropdown.classList.remove("open");
  protocolDropdown.classList.remove("open");
};

// Click outside closes dropdowns
document.addEventListener("click", (e) => {
  if (!e.target.closest(".nav-item")) {
    policyDropdown.classList.remove("open");
    protocolDropdown.classList.remove("open");
    handbookDropdown.classList.remove("open");
  }
});

// =============================
// CHAT AI LOGIC
// =============================
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
      `<b>${data.policy?.title || "Policy found:"}</b><br><br>
       ${data.answer || ""}
       ${data.policy?.link ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>` : ""}`
    );

  } catch (err) {
    hideTyping();
    addMessage("assistant", "Error connecting to server.");
  }
}

// Submit chat
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  userInput.value = "";
  askPolicy(q);
});