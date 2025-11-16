// ===== CONFIG =====
const STAFF_CODE = "cms-staff-2025";
// آدرس Worker خودت:
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api/chatbot";

// ===== ELEMENTS =====
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const chatForm = document.getElementById("chat-form");
const chatWindow = document.getElementById("chat-window");
const userInput = document.getElementById("user-input");
const logoutBtn = document.getElementById("logout-btn");

// ===== LOGIN =====
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = document.getElementById("access-code").value.trim();

  if (code === STAFF_CODE) {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    chatWindow.innerHTML = "";
    addBot(
      "Welcome! Ask anything about CMS policies and I’ll match it to the correct policy where possible."
    );
  } else {
    loginError.textContent = "Incorrect staff access code.";
  }
});

// ===== LOGOUT =====
logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginError.textContent = "";
  document.getElementById("access-code").value = "";
});

// ===== CHAT SUBMIT =====
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = userInput.value.trim();
  if (!msg) return;

  addUser(msg);
  userInput.value = "";

  const typingId = addTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: msg })
    });

    removeTyping(typingId);

    if (!res.ok) {
      addBot("There was a problem reaching the CMS policy server. Please try again.");
      return;
    }

    const data = await res.json();

    let answer =
      data.answer ||
      "I couldn’t clearly match that question to a single CMS policy. Please check the policy binder or ask the Principal/Head of School.";

    let extra = "";
    if (data.policyTitle) {
      extra += `<br><br>📘 <strong>Policy:</strong> ${data.policyTitle}`;
    }
    if (data.policyLink) {
      extra += `<br>🔗 <a href="${data.policyLink}" target="_blank" rel="noopener noreferrer">View full policy</a>`;
    }

    addBot(answer + extra);
  } catch (err) {
    console.error(err);
    removeTyping(typingId);
    addBot("Network error. Please check your connection or try again.");
  }
});

// ===== MESSAGE HELPERS =====
function addUser(text) {
  chatWindow.innerHTML += `
    <div class="message-row user">
      <div class="message-bubble user-bubble">${escapeHtml(text)}</div>
    </div>`;
  scrollBottom();
}

function addBot(text) {
  chatWindow.innerHTML += `
    <div class="message-row bot">
      <div class="message-bubble bot-bubble">${text}</div>
    </div>`;
  scrollBottom();
}

function addTyping() {
  const id = "typing-" + Math.random().toString(36).slice(2);
  chatWindow.innerHTML += `
    <div class="message-row bot" id="${id}">
      <div class="message-bubble bot-bubble typing">•••</div>
    </div>`;
  scrollBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Basic HTML escaping for user text
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}