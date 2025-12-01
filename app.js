const STAFF_CODE = "cms-staff-2025";
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const menuBtn = document.getElementById("menu-btn");
const logoutBtn = document.getElementById("logout-btn");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("overlay");

const loginForm = document.getElementById("login-form");
const accessCode = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

const chatForm = document.getElementById("chat-form");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");

/* MENU POPULATION */
const menuPolicies = document.getElementById("menu-policies");
const menuProtocols = document.getElementById("menu-protocols");
const menuParents = document.getElementById("menu-parents");

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `msg ${sender}`;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (accessCode.value === STAFF_CODE) {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    menuBtn.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");

    chatBox.innerHTML = "";
    addMessage("Hi! You can ask about any CMS policy.", "bot");
  } else {
    loginError.textContent = "Incorrect access code";
  }
});

logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  menuBtn.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  chatBox.innerHTML = "";
  accessCode.value = "";
});

menuBtn.addEventListener("click", () => {
  drawer.classList.add("open");
  overlay.classList.remove("hidden");
});

overlay.addEventListener("click", () => {
  drawer.classList.remove("open");
  overlay.classList.add("hidden");
});

document.getElementById("drawer-close").addEventListener("click", () => {
  drawer.classList.remove("open");
  overlay.classList.add("hidden");
});

/* ASK POLICY */
async function askPolicy(question) {
  addMessage(question, "user");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: question })
  });

  const data = await res.json();
  addMessage(data.answer || "No matching policy found.", "bot");
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  userInput.value = "";
  askPolicy(q);
});