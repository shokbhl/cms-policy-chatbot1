/* CONFIG */
const STAFF_CODE = "cms-staff-2025";

// ⭐ درست‌ترین API Worker
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api/chatbot";

/* ELEMENTS */
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const chatForm = document.getElementById("chat-form");
const chatWindow = document.getElementById("chat-window");
const userInput = document.getElementById("user-input");

/* LOGIN */
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = document.getElementById("access-code").value.trim();

  if (code === STAFF_CODE) {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    chatWindow.innerHTML = "";
    addBot("Welcome! Ask anything about CMS policies.");
  } else {
    loginError.textContent = "Incorrect code.";
  }
});

/* LOGOUT */
document.getElementById("logout-btn").addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

/* CHAT */
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
      body: JSON.stringify({ question: msg }),
    });

    removeTyping(typingId);

    if (!res.ok) {
      addBot("❗ Error reaching CMS policy server.");
      return;
    }

    const data = await res.json();

    let answer = data.answer || "No clear policy found.";

    // Add policy reference if available
    if (data.policyTitle) {
      answer += `\n\n📘 Policy: <b>${data.policyTitle}</b>`;
    }

    if (data.policyLink) {
      answer += `\n🔗 <a href="${data.policyLink}" target="_blank" style="color:#0046ff">Open Policy</a>`;
    }

    addBot(answer);
  } catch (err) {
    console.error(err);
    removeTyping(typingId);
    addBot("❗ Network error. Please try again.");
  }
});

/* MESSAGE HELPERS */
function addUser(text) {
  chatWindow.innerHTML += `
    <div class="message-row user">
      <div class="message-bubble">${escapeHtml(text)}</div>
    </div>`;
  scrollBottom();
}

function addBot(text) {
  chatWindow.innerHTML += `
    <div class="message-row bot">
      <div class="message-bubble">${formatHTML(text)}</div>
    </div>`;
  scrollBottom();
}

function addTyping() {
  const id = "typing-" + Math.random().toString(36).slice(2);
  chatWindow.innerHTML += `
    <div class="message-row bot" id="${id}">
      <div class="message-bubble typing">•••</div>
    </div>`;
  scrollBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* HELPERS */
function scrollBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function escapeHtml(text) {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatHTML(text) {
  return text
    .replace(/\n/g, "<br>")
    .replace(/  /g, "&nbsp;&nbsp;");
}