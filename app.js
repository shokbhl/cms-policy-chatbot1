// -------------------------------
// CONFIG — Set your Worker URL
// -------------------------------
const WORKER_URL = "https://cms-policy-worker.shokbhl.workers.dev";


// -------------------------------
// LOGIN SYSTEM
// -------------------------------
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

// Your static staff code
const STAFF_CODE = "cms2025";

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (accessCodeInput.value === STAFF_CODE) {
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


// -------------------------------
// CHAT SYSTEM
// -------------------------------
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

function addMessage(sender, text, link = null) {
  const row = document.createElement("div");
  row.className = "chat-row " + sender;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.innerHTML = text;

  if (link) {
    bubble.innerHTML += `<br><br><a class="policy-link" href="${link}" target="_blank">📄 Open Full Policy</a>`;
  }

  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}


// -------------------------------
// SEND QUESTION TO WORKER
// -------------------------------
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (!question) return;

  addMessage("user", question);
  userInput.value = "";

  addMessage("bot", "⏳ Thinking...");

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: question })
    });

    if (!response.ok) {
      throw new Error("API error " + response.status);
    }

    const data = await response.json();

    // Remove “Thinking…”
    chatWindow.lastChild.remove();

    addMessage(
      "bot",
      data.answer || "I found something:",
      data.policy?.link || null
    );

  } catch (err) {
    console.log(err);

    chatWindow.lastChild.remove();
    addMessage(
      "bot",
      "❌ Error contacting server. Please try again."
    );
  }
});