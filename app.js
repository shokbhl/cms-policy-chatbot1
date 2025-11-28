// CONFIG
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

// ELEMENTS
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const menuBtn = document.getElementById("menu-btn");
const logoutBtn = document.getElementById("logout-btn");

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCode = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// LOGIN
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (accessCode.value.trim() === "cms-staff-2025") {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    menuBtn.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    accessCode.value = "";
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// LOGOUT
logoutBtn.addEventListener("click", () => {
  chatWindow.innerHTML = "";
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  menuBtn.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  sidebar.classList.remove("open");
  overlay.classList.add("hidden");
});

// SIDEBAR
menuBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.remove("hidden");
});

overlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  overlay.classList.add("hidden");
});

// ADD MESSAGES
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.classList.add("msg", role);
  msg.innerHTML = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// TYPING DOTS
function showTyping() {
  const dot = document.createElement("div");
  dot.className = "msg assistant typing";
  dot.id = "typing";
  chatWindow.appendChild(dot);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTyping() {
  const dot = document.getElementById("typing");
  if (dot) dot.remove();
}

// ASK POLICY
async function askPolicy(question) {
  addMessage("user", question);
  showTyping();

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: question })
  });

  hideTyping();

  if (!response.ok) {
    addMessage("assistant", "Error contacting the server.");
    return;
  }

  const data = await response.json();

  const answer = `
    <b>${data.policy?.title || "Policy found"}</b><br><br>
    ${data.answer}
    ${data.policy?.link ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>` : ""}
  `;

  addMessage("assistant", answer);
}

// FORM SUBMIT
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  askPolicy(userInput.value.trim());
  userInput.value = "";
});