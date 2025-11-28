// ========== CONFIG ==========
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

// UI elements
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const chatWindow = document.getElementById("chat-window");
const topbar = document.getElementById("topbar");

const sidebar = document.getElementById("sidebar");
const openMenu = document.getElementById("openMenu");
const closeMenu = document.getElementById("closeMenu");

const logoutBtn = document.getElementById("logoutBtn");
const loginForm = document.getElementById("login-form");
const accessCode = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const policyList = document.getElementById("policyList");


// -------- LOGIN --------
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (accessCode.value === "cms-staff-2025") {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    topbar.classList.remove("hidden");

    sidebar.classList.add("hidden");

    chatWindow.innerHTML = ""; // clear chat

    loadMenuList();
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});


// -------- LOGOUT --------
logoutBtn.addEventListener("click", () => {
  chatWindow.innerHTML = "";
  userInput.value = "";

  chatScreen.classList.add("hidden");
  topbar.classList.add("hidden");
  sidebar.classList.add("hidden");

  loginScreen.classList.remove("hidden");
});


// -------- MENU OPEN/CLOSE --------
openMenu.addEventListener("click", () => sidebar.classList.add("show"));
closeMenu.addEventListener("click", () => sidebar.classList.remove("show"));


// -------- ADD MESSAGE --------
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}


// -------- TYPING DOTS --------
function showTyping() {
  const dot = document.createElement("div");
  dot.className = "msg assistant";
  dot.innerHTML = `<div class="typing"></div>`;
  chatWindow.appendChild(dot);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return dot;
}


// -------- SEND QUESTION --------
async function askPolicy(q) {
  addMessage("user", q);
  const typingNode = showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q })
    });

    typingNode.remove();

    if (!res.ok) {
      addMessage("assistant", "Network error");
      return;
    }

    const data = await res.json();
    const answer = `
      <b>${data.policy?.title || "Policy"}</b><br><br>
      ${data.answer}
      ${data.policy?.link ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>` : ""}
    `;

    addMessage("assistant", answer);

  } catch {
    typingNode.remove();
    addMessage("assistant", "Server error");
  }
}


// -------- CHAT FORM --------
chatForm.addEventListener("submit", e => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  askPolicy(q);
  userInput.value = "";
});


// -------- LOAD MENU LIST --------
function loadMenuList() {
  // This can be dynamic later
  policyList.innerHTML = `
    <li>Safe Arrival</li>
    <li>Sleep Policy</li>
    <li>Health & Safety</li>
    <li>Playground Policy</li>
    <li>Missing Children Protocol</li>
  `;
}