// --- YOUR WORKER URL HERE ---
const WORKER_URL = "cms-policy-worker.shokbhl.workers.dev"; 
// 👆 اینو با URL واقعی Cloudflare Worker خودت عوض کن

// ---------------------------
// LOGIN SCREEN
// ---------------------------
document.getElementById("login-form").addEventListener("submit", function (e) {
  e.preventDefault();
  const code = document.getElementById("access-code").value.trim();

  if (code === "cms2025") {
    // درستش کن هر چی میخوای
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("chat-screen").classList.remove("hidden");
  } else {
    document.getElementById("login-error").textContent = "Invalid access code.";
  }
});

// ---------------------------
// LOG OUT
// ---------------------------
document.getElementById("logout-btn").addEventListener("click", () => {
  document.getElementById("chat-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
});

// ---------------------------
// SEND MESSAGE
// ---------------------------
document.getElementById("chat-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const input = document.getElementById("user-input").value.trim();
  document.getElementById("user-input").value = "";

  addMessage("user", input);

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: input })
    });

    if (!res.ok) {
      addMessage("bot", "Server error — please try again.");
      return;
    }

    const data = await res.json();

    let answer = data.answer || data.content || JSON.stringify(data, null, 2);

    addMessage("bot", answer);

  } catch (err) {
    addMessage("bot", "Network error — please try again.");
  }
});

// ---------------------------
// ADD MESSAGE TO CHAT WINDOW
// ---------------------------
function addMessage(sender, text) {
  const chat = document.getElementById("chat-window");
  const bubble = document.createElement("div");
  bubble.className = sender === "user" ? "chat-bubble user" : "chat-bubble bot";
  bubble.textContent = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}