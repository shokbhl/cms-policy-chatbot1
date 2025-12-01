// ========== CONFIG ==========
const API_URL = "https://cms-policy-worker.shokbhl.workers.dev/api";
const STAFF_CODE = "cms-staff-2025"; // کد ورود

// چند آیتم نمونه برای منو (می‌تونی بیشترش کنی)
const MENU_ITEMS = {
  policies: [
    { id: "safe_arrival", label: "Safe Arrival & Dismissal" },
    { id: "playground_safety", label: "Playground Safety" },
    { id: "anaphylaxis_policy", label: "Anaphylaxis Policy" },
    { id: "medication_administration", label: "Medication Administration" },
    { id: "emergency_management", label: "Emergency Management" },
    { id: "sleep_toddlers", label:"Sleep Supervision Policy and Procedures (Toddler & Preschool)"},
    {id:"serious_occurrence", label:"serious_occurrence Policy"},
    {id:"sleep_infants", label:"Sleep Supervision Policy and Procedures (Infants)"},
    {id:"students_volunteers", label:"Supervision of Students & Volunteers Policy"},
    {id:"waiting_list", label:"Waiting List Policy & Procedures"},
    {id:"program_statement", label:"Program Statement Implementation Policy"},
    {id:"staff_development", label:"Staff Development & Training Policy"},
    {id:"parent_issues_concerns", label:"Parent Issues and Concerns Policy and Procedures"},
    {id:"behaviour_management_monitoring", label:"Behaviour Management Monitoring Policy"},
    {id:"fire_safety", label:"Fire Safety Evacuation Procedures"},
    {id:"criminal_reference_vsc_policy", label:"Criminal Reference / Vulnerable Sector Check Policy"},
    {id:"", label:""}

  ],
  protocols: [
    { id: "serious_occurrence", label: "Serious Occurrence" },
    { id: "sleep_toddlers", label: "Sleep Supervision (Toddler & Preschool)" },
    { id: "sleep_infants", label: "Sleep Supervision (Infants)" },
    { id: "students_volunteers", label: "Supervision of Students & Volunteers" },
    { id: "waiting_list", label: "Waiting List Procedures" }
  ]
};

// ========== DOM ELEMENTS ==========

// Login / chat
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// Header actions
const topActions = document.getElementById("top-actions");
const logoutBtn = document.getElementById("logout-btn");
const menuToggle = document.getElementById("menu-toggle");

// Side menu
const sideMenu = document.getElementById("side-menu");
const overlay = document.getElementById("overlay");
const closeMenuBtn = document.getElementById("close-menu");
const policyListEl = document.getElementById("policy-list");
const protocolListEl = document.getElementById("protocol-list");

// برای نگه داشتن bubble تایپینگ
let typingBubble = null;

// ========== HELPERS ==========

// ساخت حباب پیام
function addMessage(role, htmlText) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = htmlText;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return msg;
}

// ساخت bubble تایپینگ (سه نقطه)
function showTyping() {
  // اگر از قبل هست، اول حذفش کنیم
  hideTyping();

  const wrapper = document.createElement("div");
  wrapper.className = "typing-bubble";

  const dots = document.createElement("div");
  dots.className = "typing-dots";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "typing-dot";
    dots.appendChild(dot);
  }

  wrapper.appendChild(dots);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  typingBubble = wrapper;
}

// حذف bubble تایپینگ
function hideTyping() {
  if (typingBubble && typingBubble.parentNode) {
    typingBubble.parentNode.removeChild(typingBubble);
  }
  typingBubble = null;
}

// پاک کردن کامل چت
function clearChat() {
  chatWindow.innerHTML = "";
}

// ========== LOGIN LOGIC ==========

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();

  if (code === STAFF_CODE) {
    loginError.textContent = "";
    accessCodeInput.value = "";

    // نمایش چت، مخفی کردن لاگین
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    // نمایش دکمه های بالا (logout + منو)
    topActions.classList.remove("hidden");

    // چت تمیز
    clearChat();

    // خوش‌آمدگویی
    addMessage(
      "assistant",
      "Hi! 👋 You can ask me about any CMS policy or use the menu to jump directly to a specific policy."
    );
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// خروج (Logout)
logoutBtn.addEventListener("click", () => {
  // بستن منو اگر باز است
  closeSideMenu();

  // مخفی کردن چت، نمایش لاگین
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  // مخفی کردن دکمه‌های بالا
  topActions.classList.add("hidden");

  // پاک کردن چت
  clearChat();

  // پاک کردن پسورد
  accessCodeInput.value = "";
});

// ========== SIDE MENU LOGIC ==========

function openSideMenu() {
  sideMenu.classList.remove("hidden");
  // کمی زمان بدیم تا کلاس open ترنزیشن بگیرد
  requestAnimationFrame(() => {
    sideMenu.classList.add("open");
    overlay.classList.add("active");
  });
}

function closeSideMenu() {
  sideMenu.classList.remove("open");
  overlay.classList.remove("active");
  // بعد از انیمیشن، hidden کنیم
  setTimeout(() => {
    if (!sideMenu.classList.contains("open")) {
      sideMenu.classList.add("hidden");
    }
  }, 250);
}

menuToggle.addEventListener("click", () => {
  if (sideMenu.classList.contains("hidden") || !sideMenu.classList.contains("open")) {
    openSideMenu();
  } else {
    closeSideMenu();
  }
});

closeMenuBtn.addEventListener("click", closeSideMenu);
overlay.addEventListener("click", closeSideMenu);

// پر کردن منو با آیتم‌ها
function populateMenu() {
  policyListEl.innerHTML = "";
  protocolListEl.innerHTML = "";

  MENU_ITEMS.policies.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.textContent = item.label;
    btn.dataset.question = `Please show me the policy: ${item.label}`;
    btn.addEventListener("click", () => {
      closeSideMenu();
      // مستقیماً سوال را بفرستیم
      askPolicy(btn.dataset.question, /*fromMenu=*/ true);
    });
    policyListEl.appendChild(btn);
  });

  MENU_ITEMS.protocols.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.textContent = item.label;
    btn.dataset.question = `Please show me the protocol: ${item.label}`;
    btn.addEventListener("click", () => {
      closeSideMenu();
      askPolicy(btn.dataset.question, /*fromMenu=*/ true);
    });
    protocolListEl.appendChild(btn);
  });
}

// یک بار در شروع صفحه منو را بساز
populateMenu();

// ========== CHAT / API ==========

async function askPolicy(question, fromMenu = false) {
  const trimmed = question.trim();
  if (!trimmed) return;

  // اگر از منو نیامده، ورودی را خود کارمند نوشته، پس در راست نمایش بده
  if (!fromMenu) {
    addMessage("user", trimmed);
  } else {
    // برای منو هم مثل سوال کارمند راست‌چین نشان بده تا حس چت طبیعی باشد
    addMessage("user", trimmed);
  }

  // نمایش حباب تایپینگ
  showTyping();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed })
    });

    // قبل از نمایش جواب، تایپینگ را حذف کن
    hideTyping();

    if (!response.ok) {
      addMessage("assistant", "Network error — please try again.");
      return;
    }

    const data = await response.json();

    const answerHtml =
      `<b>${data.policy?.title || "Policy found:"}</b><br><br>` +
      (data.answer || "") +
      (data.policy?.link
        ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`
        : "");

    addMessage("assistant", answerHtml);
  } catch (err) {
    hideTyping();
    addMessage("assistant", "Error connecting to server.");
  }
}

// ارسال فرم چت
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value;
  userInput.value = "";
  askPolicy(q, false);
});