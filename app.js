// ============================
// CONFIG
// ============================
const WORKER_URL = "https://cms-policy-worker.shokbhl.workers.dev";

// ============================
// LOGIN HANDLING
// ============================
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const accessCodeInput = document.getElementById("access-code");
const logoutBtn = document.getElementById("logout-btn");

// Staff code (simple check)
const STAFF_CODE = "cms2025";

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === STAFF_CODE) {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    loginError.textContent = "";
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  accessCodeInput.value = "";
});


// ============================
// CHAT FUNCTIONALITY
// ============================
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");

// Function: Add message bubble
function addMessage(sender, text, isLink = false) {
  const msg = document.createElement("div");
  msg.classList.add("msg", sender);

  if (isLink) {
    msg.innerHTML = `<a href="${text}" target="_blank">${text}</a>`;
  } else {
    msg.textContent = text;
  }

  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}


// ============================
// SEND QUESTION → WORKER
// ============================
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();
  if (!question) return;

  // Show user message
  addMessage("user", question);

  // Clear input
  userInput.value = "";

  try {
    // Worker call
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question })
    });

    if (!response.ok) {
      addMessage("bot", "Error: Server not responding.");
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      addMessage("bot", "Error: Could not read server JSON.");
      return;
    }

    // Parse bot answer
    if (data.answer) {
      addMessage("bot", data.answer);
    }

    // Show policy link
    if (data.policy && data.policy.link) {
      addMessage("bot", data.policy.link, true);
    }

  } catch (err) {
    addMessage("bot", "Network error. Please try again.");
  }
});