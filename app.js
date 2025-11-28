// =======================
// CONFIG
// =======================
const STAFF_CODE = "cms-staff-2025";

// ⚠️ مهم: اگر Worker شما مسیر /api/chatbot دارد همین را نگه‌دار
// اگر تغییر دادی فقط همین URL را اصلاح کن
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api/chatbot";

// =======================
// ELEMENTS
// =======================
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const chatForm = document.getElementById("chat-form");
const chatWindow = document.getElementById("chat-window");
const userInput = document.getElementById("user-input");
const logoutBtn = document.getElementById("logout-btn");

// صفحه منو
const menuScreen = document.getElementById("menu-screen");
const menuBtn = document.getElementById("menu-btn");
const menuClose = document.getElementById("menu-close");
const menuList = document.getElementById("menu-list");

// =======================
// LOAD POLICY LIST
// =======================
async function loadMenu() {
  try {
    const res = await fetch(API_URL.replace("/chatbot", "/list"));

    if (!res.ok) {
      menuList.innerHTML = "<li>Error loading list</li>";
      return;
    }

    const data = await res.json();

    menuList.innerHTML = "";

    data.forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${item.title}</strong><br>
        <a href="${item.link}" target="_blank">Open policy</a>
      `;
      menuList.appendChild(li);
    });
  } catch (e) {
    console.error(e);
    menuList.innerHTML = "<li>Network error loading list</li>";
  }
}

// =======================
// OPEN/CLOSE MENU
// =======================
menuBtn.addEventListener("click", () => {
  menuScreen.classList.remove("hidden");
  loadMenu();
});

menuClose.addEventListener("click", () => {
  menuScreen.classList.add("hidden");
});

// =======================
// LOGIN
// =======================
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = document.getElementById("access-code").value.trim();

  if (code === STAFF_CODE) {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    chatWindow.innerHTML = "";
    addBot("Welcome! Ask anything about CMS policies.");
  } else {
    loginError.textContent = "Incorrect staff access code.";
  }
});

// =======================
// LOGOUT
// =======================
logoutBtn.addEventListener("click", () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginError.textContent = "";
  document.getElementById("access-code").value = "";
  menuScreen.classList.add("hidden");
});

// =======================
// CHAT SEND MESSAGE
// =======================
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
      headers: { 
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ question: msg })
    });

    removeTyping(typingId);

    if (!res.ok) {
      addBot("Server error — please try again.");
      return;
    }

    const data = await res.json();

    let html = (data.answer || "No clear answer.") + "<br><br>";

    if (data.policyTitle) {
      html += `📘 <strong>${data.policyTitle}</strong><br>`;
    }
    if (data.policyLink) {
      html += `🔗 <a href="${data.policyLink}" target="_blank">View full policy</a>`;
    }

    addBot(html);
  } catch (err) {
    console.error(err);
    removeTyping(typingId);
    addBot("Network error — please try again.");
  }
});

// =======================
// MESSAGE UI FUNCTIONS
// =======================
function addUser(text) {
  chatWindow.innerHTML += `
    <div class="message-row user">
      <div class="message-bubble user-bubble">${escapeHtml(text)}</div>
    </div>
  `;
  scrollBottom();
}

function addBot(html) {
  chatWindow.innerHTML += `
    <div class="message-row bot">
      <div class="message-bubble bot-bubble">${html}</div>
    </div>
  `;
  scrollBottom();
}

function addTyping() {
  const id = "typing-" + Math.random().toString(36).slice(2);
  chatWindow.innerHTML += `
    <div class="message-row bot" id="${id}">
      <div class="message-bubble bot-bubble typing">•••</div>
    </div>
  `;
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

// Escape HTML
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
}