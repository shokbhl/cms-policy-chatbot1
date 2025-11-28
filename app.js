// ========== CONFIG ==========
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

// ========== LOGIN ==========
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

// ========== CHAT ==========
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// Add message bubble
function addMessage(role, html) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = html;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Typing indicator
function addTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant typing";
  wrap.innerHTML = `
    <div class="typing-indicator">
      <div></div><div></div><div></div>
    </div>
  `;
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return wrap;
}

async function askPolicy(question) {
  addMessage("user", question);

  const typingBubble = addTyping();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question })
    });

    typingBubble.remove();

    if (!response.ok) {
      addMessage("assistant", "Network error. Please try again.");
      return;
    }

    const data = await response.json();

    const answerHTML =
      `<b>${data.policy?.title || "Policy"}</b><br><br>` +
      data.answer +
      (data.policy?.link
        ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`
        : "");

    addMessage("assistant", answerHTML);

  } catch {
    typingBubble.remove();
    addMessage("assistant", "Error contacting the server.");
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (q) askPolicy(q);
  userInput.value = "";
});