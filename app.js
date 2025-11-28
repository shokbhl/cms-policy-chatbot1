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

// LOGOUT FIX
logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  accessCodeInput.value = "";
});


// ========== CHAT SYSTEM ==========
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Send request to Worker
async function askPolicy(question) {
  addMessage("user", question);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question })
    });

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
    addMessage("assistant", "Error connecting to server.");
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!userInput.value.trim()) return;
  askPolicy(userInput.value.trim());
  userInput.value = "";
});