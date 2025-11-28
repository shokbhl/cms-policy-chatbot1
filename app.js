// CONFIG
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";

// ELEMENTS
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const chatForm = document.getElementById("chat-form");
const menuBtn = document.getElementById("menu-btn");
const sideMenu = document.getElementById("side-menu");
const overlay = document.getElementById("overlay");
const logoutBtn = document.getElementById("logout-btn");
const policyList = document.getElementById("policy-list");
const protocolList = document.getElementById("protocol-list");
const chatWindow = document.getElementById("chat-window");
const userInput = document.getElementById("user-input");


// ========== LOGIN ==========
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = document.getElementById("access-code").value.trim();

  if (code === "cms-staff-2025") {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    loadMenuItems();  // load policies+protocols into sidebar
  } else {
    document.getElementById("login-error").textContent = "Incorrect access code.";
  }
});


// ========== MENU OPEN/CLOSE ==========
menuBtn.onclick = () => {
  sideMenu.classList.remove("hidden");
  overlay.classList.remove("hidden");
};

overlay.onclick = () => {
  sideMenu.classList.add("hidden");
  overlay.classList.add("hidden");
};


// ========== LOGOUT ==========
logoutBtn.onclick = () => {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
};


// ========== ADD MESSAGE ==========
function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = text;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addTyping() {
  const dot = document.createElement("div");
  dot.className = "msg assistant typing";
  chatWindow.appendChild(dot);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return dot;
}


// ========== LOAD MENU ITEMS ==========
async function loadMenuItems() {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "__list_all__" })
  });

  const data = await res.json();

  policyList.innerHTML = "";
  protocolList.innerHTML = "";

  data.policies.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.title;
    li.onclick = () => askPolicy(p.title);
    policyList.appendChild(li);
  });

  data.protocols.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.title;
    li.onclick = () => askPolicy(p.title);
    protocolList.appendChild(li);
  });
}


// ========== ASK POLICY ==========
async function askPolicy(question) {
  addMessage("user", question);

  const typingBubble = addTyping();

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: question })
  });

  typingBubble.remove();

  const data = await response.json();
  let html = `<b>${data.policy?.title || "Policy"}</b><br><br>${data.answer}`;
  if (data.policy?.link) {
    html += `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`;
  }

  addMessage("assistant", html);
}


// ========== SUBMIT CHAT ==========
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  askPolicy(userInput.value.trim());
  userInput.value = "";
});