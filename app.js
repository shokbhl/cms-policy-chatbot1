// ================= CONFIG =================
const API_BASE = "https://cms-policy-chatbot-v2.shokbhl.workers.dev";
const LOGIN_URL = `${API_BASE}/login`;
const API_URL   = `${API_BASE}/api`;

// ================= DOM =================
const loginScreen = document.getElementById("login-screen");
const chatScreen  = document.getElementById("chat-screen");

const loginForm   = document.getElementById("login-form");
const usernameInp = document.getElementById("username");
const passwordInp = document.getElementById("password");
const campusSel   = document.getElementById("campus");
const loginError  = document.getElementById("login-error");

const topActions  = document.getElementById("top-actions");
const campusPill  = document.getElementById("campus-pill");
const logoutBtn   = document.getElementById("logout-btn");

const chatWindow  = document.getElementById("chat-window");
const chatForm    = document.getElementById("chat-form");
const userInput   = document.getElementById("user-input");

const menuPills   = document.querySelectorAll(".menu-pill");
const menuPanel   = document.getElementById("menu-panel");
const menuOverlay = document.getElementById("menu-overlay");
const menuTitle   = document.getElementById("menu-panel-title");
const menuBody    = document.getElementById("menu-panel-body");
const menuClose   = document.getElementById("menu-panel-close");

let typingBubble = null;

// ================= SESSION =================
function setSession(data) {
  localStorage.setItem("cms_session", JSON.stringify(data));
}
function getSession() {
  try { return JSON.parse(localStorage.getItem("cms_session")); }
  catch { return null; }
}
function clearSession() {
  localStorage.removeItem("cms_session");
}

// ================= UI HELPERS =================
function clearChat() {
  chatWindow.innerHTML = "";
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = text;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showTyping() {
  hideTyping();
  const d = document.createElement("div");
  d.className = "typing-bubble";
  d.innerHTML = `<div class="typing-dots">
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  </div>`;
  chatWindow.appendChild(d);
  typingBubble = d;
}

function hideTyping() {
  if (typingBubble) typingBubble.remove();
  typingBubble = null;
}

// ================= SCREEN SWITCH =================
function showChatUI(campus) {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  topActions.classList.remove("hidden");
  campusPill.textContent = `Campus: ${campus}`;

  clearChat();
  addMessage(
    "assistant",
    "Hi 👋 You can ask about any CMS policy or protocol, or open your campus Parent Handbook from the menu above."
  );
}

function showLoginUI() {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  topActions.classList.add("hidden");
  campusPill.textContent = "Campus: —";

  clearChat();
  loginError.textContent = "";
  loginError.classList.add("hidden");

  usernameInp.value = "";
  passwordInp.value = "";
  campusSel.value   = "";
}

// ================= AUTH =================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");

  const username = usernameInp.value.trim();
  const password = passwordInp.value.trim();
  const campus   = campusSel.value.trim();

  if (!username || !password || !campus) {
    loginError.textContent = "Please enter username, password, and campus.";
    loginError.classList.remove("hidden");
    return;
  }

  try {
    const res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, campus })
    });

    const data = await res.json();

    if (!res.ok) {
      loginError.textContent = data.error || "Login failed.";
      loginError.classList.remove("hidden");
      return;
    }

    setSession({
      token: data.token,
      campus: data.campus,
      role: data.role
    });

    showChatUI(data.campus);

  } catch {
    loginError.textContent = "Network error.";
    loginError.classList.remove("hidden");
  }
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  showLoginUI();
});

// ================= AUTO BOOT =================
(function boot() {
  const s = getSession();
  if (s?.token && s?.campus) showChatUI(s.campus);
  else showLoginUI();
})();

// ================= MENU =================
function closeMenu() {
  menuPanel.classList.add("hidden");
  menuOverlay.classList.add("hidden");
  menuPills.forEach(b => b.classList.remove("active"));
}

menuClose.addEventListener("click", closeMenu);
menuOverlay.addEventListener("click", closeMenu);

menuPills.forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.menu;
    menuPills.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    menuTitle.textContent =
      type === "policies" ? "Policies" :
      type === "protocols" ? "Protocols" :
      "Parent Handbook";

    menuBody.innerHTML = "";

    if (type === "handbook") {
      const s = getSession();
      const campus = s?.campus;
      const b = document.createElement("button");
      b.className = "menu-item-btn";
      b.textContent = `Open Parent Handbook — ${campus}`;
      b.onclick = () => {
        closeMenu();
        ask(`Show the parent handbook for campus ${campus}`);
      };
      menuBody.appendChild(b);
    }

    menuPanel.classList.remove("hidden");
    menuOverlay.classList.remove("hidden");
  });
});

// ================= CHAT =================
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  userInput.value = "";
  ask(q);
});

async function ask(question) {
  const s = getSession();
  if (!s?.token) {
    showLoginUI();
    return;
  }

  addMessage("user", escapeHtml(question));
  showTyping();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${s.token}`
      },
      body: JSON.stringify({ query: question })
    });

    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      addMessage("assistant", data.error || "Error");
      if (res.status === 401) {
        clearSession();
        showLoginUI();
      }
      return;
    }

    const title = data.policy?.title || "Result";
    const src   = data.policy?.source ? ` (${data.policy.source})` : "";
    const link  = data.policy?.link
      ? `<br><br><a href="${data.policy.link}" target="_blank">Open full document</a>`
      : "";

    addMessage(
      "assistant",
      `<b>${escapeHtml(title)}${src}</b><br><br>${escapeHtml(data.answer)}${link}`
    );

  } catch {
    hideTyping();
    addMessage("assistant", "Network error.");
  }
}

// ================= SANITIZE =================
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}