// CONFIG
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

// LOGIN SYSTEM
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (accessCodeInput.value.trim() === "cms-staff-2025") {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  accessCodeInput.value = "";
});

// CHAT SYSTEM
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// Add chat bubble
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Typing animation bubble
function showTyping() {
  const bubble = document.createElement("div");
  bubble.className = "typing msg assistant";
  bubble.id = "typingBubble";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function hideTyping() {
  const bubble = document.getElementById("typingBubble");
  if (bubble) bubble.remove();
}

// SEND QUESTION
async function askPolicy(question) {
  addMessage("user", question);

  showTyping();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question })
    });

    hideTyping();

    if (!response.ok) {
      addMessage("assistant", "Network error — please try again.");
      return;
    }

    const data = await response.json();

    const answer =
      `<b>${data.policy?.title || "Policy"}</b><br><br>` +
      data.answer +
      (data.policy?.link
        ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`
        : "");

    addMessage("assistant", answer);

  } catch (err) {
    hideTyping();
    addMessage("assistant", "Server error.");
  }
}

// FORM SUBMIT
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!userInput.value.trim()) return;
  askPolicy(userInput.value.trim());
  userInput.value = "";
});