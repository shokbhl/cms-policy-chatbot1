// ========== CONFIG ==========
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";
const ACCESS_CODE = "cms-staff-2025";

// ========== DOM ELEMENTS ==========

// Login
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");

// Chat
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// Menu
const menuToggle = document.getElementById("menu-toggle");
const menuClose = document.getElementById("menu-close");
const sideMenu = document.getElementById("side-menu");
const backdrop = document.getElementById("backdrop");
const policyList = document.getElementById("policy-list");
const protocolList = document.getElementById("protocol-list");

// Logout
const logoutBtn = document.getElementById("logout-btn");

// ========== LOGIN ==========
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === ACCESS_CODE) {
    loginError.textContent = "";
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    userInput.focus();
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  // برگرد به صفحه لاگین
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  accessCodeInput.value = "";
  loginError.textContent = "";
});

// ========== CHAT HELPERS ==========

// ساخت حباب پیام
function addMessage(role, html, extraClass = "") {
  const div = document.createElement("div");
  div.className = `msg ${role} ${extraClass}`.trim();
  div.innerHTML = html;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return div;
}

// حباب تایپینگ سه نقطه
function showTypingBubble() {
  const bubble = document.createElement("div");
  bubble.className = "msg assistant typing";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "typing-dot";
    bubble.appendChild(dot);
  }

  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

// ========== ASK POLICY ==========
async function askPolicy(question) {
  if (!question) return;

  // پیام کاربر
  addMessage("user", question);

  // حباب تایپینگ
  const typingBubble = showTypingBubble();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question })
    });

    // حذف تایپینگ
    typingBubble.remove();

    if (!response.ok) {
      addMessage("assistant", "Network error — please try again.");
      return;
    }

    const data = await response.json();

    const answerHtml =
      `<strong>${data.policy?.title || "Policy found:"}</strong><br><br>` +
      data.answer +
      (data.policy?.link
        ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`
        : "");

    addMessage("assistant", answerHtml);
  } catch (err) {
    typingBubble.remove();
    addMessage("assistant", "Error connecting to server.");
  }
}

// Submit فرم چت
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  askPolicy(q);
  userInput.value = "";
});

// ========== SIDE MENU LOGIC ==========

function openMenu() {
  sideMenu.classList.add("open");
  backdrop.classList.add("show");
}
function closeMenu() {
  sideMenu.classList.remove("open");
  backdrop.classList.remove("show");
}

menuToggle.addEventListener("click", openMenu);
menuClose.addEventListener("click", closeMenu);
backdrop.addEventListener("click", closeMenu);

// کلیک روی لیست پالیسی‌ها / پروتکل‌ها
function handleMenuClick(e) {
  const li = e.target.closest("li");
  if (!li) return;

  const title = li.textContent.trim();
  const link = li.dataset.link || "";

  // هم یک جواب چتی بسازیم، هم اگر لینک بود، لینک بدهیم
  const html =
    `<strong>${title}</strong><br><br>` +
    (link
      ? `Open the full document: <a href="${link}" target="_blank">click here</a>.`
      : "This item doesn’t have a link yet.");

  addMessage("assistant", html);
  closeMenu();
}

policyList.addEventListener("click", handleMenuClick);
protocolList.addEventListener("click", handleMenuClick);