// CONFIG
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";
const STAFF_CODE = "cms-staff-2025";

// DOM ELEMENTS
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

let typingBubble = null;

// --------------------------------
// MESSAGE HELPERS
// --------------------------------
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

// --------------------------------
// LOGIN
// --------------------------------
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === STAFF_CODE) {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    topActions.classList.remove("hidden");

    clearChat();
    addMessage("assistant", "Hi 👋 Ask me any CMS policy question.");

  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// --------------------------------
// LOGOUT
// --------------------------------
logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  topActions.classList.add("hidden");
  clearChat();
  accessCodeInput.value = "";
});

// --------------------------------
// ASK POLICY
// --------------------------------
async function askPolicy(question) {
  if (!question.trim()) return;

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
      `<b>${data.policy?.title || "Policy found:"}</b><br><br>${data.answer || ""}${
        data.policy?.link
          ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`
          : ""
      }`
    );

  } catch (err) {
    hideTyping();
    addMessage("assistant", "Server error — please try again.");
  }
}

// --------------------------------
// CHAT FORM
// --------------------------------
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  userInput.value = "";
  askPolicy(q);
});