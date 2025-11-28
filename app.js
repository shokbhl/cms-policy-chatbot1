const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const accessCode = document.getElementById("access-code");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

const menuBtn = document.getElementById("menu-btn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const logoutBtn = document.getElementById("logout-btn");

// ===== LOGIN =====
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (accessCode.value.trim() === "cms-staff-2025") {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    menuBtn.classList.remove("hidden");
    chatWindow.innerHTML = "";
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// ===== LOGOUT =====
logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  menuBtn.classList.add("hidden");
  accessCode.value = "";
  chatWindow.innerHTML = "";
});

// ===== Sidebar =====
menuBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.remove("hidden");
});

overlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  overlay.classList.add("hidden");
});

// ===== Add Message Bubble =====
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = role === "user" ? "msg user-msg" : "msg bot-msg";
  msg.innerHTML = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ===== Typing Animation =====
function showTyping() {
  const t = document.createElement("div");
  t.className = "msg bot-msg typing";
  chatWindow.appendChild(t);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return t;
}

// ===== Ask Policy =====
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();
  addMessage("user", question);
  userInput.value = "";

  const typingBubble = showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question })
    });

    typingBubble.remove();

    const data = await res.json();
    const answer =
      `<b>${data.policy?.title || "Policy"}:</b><br><br>${data.answer}<br><br>` +
      (data.policy?.link ? `<a href="${data.policy.link}" target="_blank">Open full policy</a>` : "");

    addMessage("bot", answer);

  } catch {
    typingBubble.remove();
    addMessage("bot", "Error contacting server.");
  }
});