// ========== CONFIG ==========
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

// ========== ELEMENTS ==========
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menu-btn");

const logoutBtn = document.getElementById("logout-btn");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// ========== LOGIN ==========
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (accessCodeInput.value.trim() === "cms-staff-2025") {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    menuBtn.classList.remove("hidden"); // show sidebar hamburger
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// ========== LOGOUT ==========
logoutBtn.addEventListener("click", () => {
  chatWindow.innerHTML = ""; // clear chat
  accessCodeInput.value = "";
  loginError.textContent = "";

  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  sidebar.classList.add("hidden");
  menuBtn.classList.add("hidden");
});

// ========== SIDEBAR ==========
menuBtn.addEventListener("click", () => {
  sidebar.classList.toggle("hidden");
});

// ========== MESSAGE BUBBLE ==========
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ========== TYPING ANIMATION ==========
function showTyping() {
  const typing = document.createElement("div");
  typing.className = "msg assistant";
  typing.id = "typing";
  typing.innerHTML = `
    <div class="typing">
      <div></div><div></div><div></div>
    </div>
  `;
  chatWindow.appendChild(typing);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

// ========== ASK POLICY ==========
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
      `<b>${data.policy?.title || ""}</b><br><br>` +
      data.answer +
      (data.policy?.link
        ? `<br><br>Open the full document: <a href="${data.policy.link}" target="_blank">click here.</a>`
        : "");

    addMessage("assistant", answer);

  } catch (err) {
    hideTyping();
    addMessage("assistant", "Error connecting to server.");
  }
}

// ========== FORM SUBMIT ==========
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  askPolicy(userInput.value.trim());
  userInput.value = "";
});