// ====== CONFIG ======
const STAFF_ACCESS_CODE = "cms-staff-2025"; // 🔒 access code for staff only
const STORAGE_KEY_LOGGED_IN = "schoolPolicyChatbotLoggedIn";

// ====== POLICY KNOWLEDGE BASE ======
// Each item represents one policy area. You can easily add or edit policies here.
const POLICY_FAQS = [
  {
    id: "anaphylaxis",
    title: "Anaphylaxis & Severe Allergies",
    keywords: ["allergy", "epipen", "reaction", "nut", "peanut", "tree nut"],
    answer:
      "Anaphylaxis is a severe, potentially life-threatening allergic reaction. Staff must administer epinephrine immediately at the first sign of anaphylaxis and call 911. The child must always be accompanied to the hospital, even if symptoms improve.",
    link: "https://docs.google.com/document/d/1YWBYRtwwrunMv041-MAh-XBzW9HIRc_h"
  },
  {
    id: "safe_arrival",
    title: "Safe Arrival & Dismissal",
    keywords: [
      "arrival",
      "dismissal",
      "pickup",
      "drop off",
      "absent",
      "late",
      "no show",
      "child not picked up"
    ],
    answer:
      "Children are released only to authorized individuals. If a child is absent without notice, staff contact parents by 10:00 a.m. If a parent fails to pick up a child, emergency contacts are called, and if no response by 7:00 p.m., Children’s Aid Society is contacted.",
    link: "https://docs.google.com/document/d/1IpN3To4GJnHFc-EMaT4qkBBTfY6Cvz_h"
  },
  {
    id: "medication",
    title: "Medication Administration",
    keywords: ["medicine", "medication", "doctor", "dose", "label", "prescription"],
    answer:
      "Medication can only be given if it’s prescribed or authorized by a doctor and in its original labelled container. A medication form must be signed, and administration is documented daily.",
    link: "https://docs.google.com/document/d/1wlfJ0bwOzgK2qZ-qvK0ghBeCQrFaNvMW"
  },
  {
    id: "sleep_infants",
    title: "Sleep Supervision – Infants",
    keywords: ["sleep", "infant", "crib", "nap", "check", "supervision"],
    answer:
      "Infants under 12 months are placed on their backs to sleep, and staff visually check them every 15 minutes. Checks include breathing, colour, and signs of distress.",
    link: "https://docs.google.com/document/d/1HoWGu9GNCalQ4QzIVwtIopinMJC79lNX"
  },
  {
    id: "parent_issues",
    title: "Parent Issues & Concerns",
    keywords: ["parent", "concern", "complaint", "feedback", "report", "issue"],
    answer:
      "CMS encourages open, respectful communication. All concerns are documented and investigated fairly. Staff must report any suspected child abuse directly to Children’s Aid Society.",
    link: "https://docs.google.com/document/d/1pHAxv4AAjTsho6S9uvxmcI5dIUxsfF_2"
  },
  {
    id: "public_health",
    title: "Public Health & Illness",
    keywords: [
      "illness",
      "sick",
      "fever",
      "infection",
      "vomit",
      "diarrhea",
      "head lice",
      "public health"
    ],
    answer:
      "Children who are ill (fever, vomiting, diarrhea, rash, etc.) must go home and return only when symptom-free for 24 hours. Staff follow Toronto Public Health guidelines for cleaning and isolation.",
    link: "https://docs.google.com/document/d/1T_JBLAb6DhIZpCy1jrTx10f18SFRzO8V"
  }
];

// ====== ELEMENTS ======
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

// ====== INIT ======
document.addEventListener("DOMContentLoaded", () => {
  const loggedIn = localStorage.getItem(STORAGE_KEY_LOGGED_IN) === "true";
  if (loggedIn) {
    showChatScreen();
    addBotMessage(
      "Welcome back! You can ask me anything about CMS policies — for example: “What happens if a child isn’t picked up?” or “How often do we check infants during sleep?”"
    );
  } else {
    showLoginScreen();
  }
});

// ====== LOGIN / LOGOUT ======
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = accessCodeInput.value.trim();
  if (code === STAFF_ACCESS_CODE) {
    loginError.textContent = "";
    accessCodeInput.value = "";
    localStorage.setItem(STORAGE_KEY_LOGGED_IN, "true");
    showChatScreen();
    addBotMessage("Hi! I'm your School Policy Assistant 👋 Ask me about any policy.");
  } else {
    loginError.textContent = "Incorrect access code. Please try again.";
  }
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY_LOGGED_IN);
  clearChat();
  showLoginScreen();
});

// ====== SCREEN TOGGLE ======
function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
}
function showChatScreen() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
}

// ====== CHAT HANDLING ======
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message) return;
  addUserMessage(message);
  userInput.value = "";
  const typingId = addBotTyping();

  setTimeout(async () => {
    removeBotTyping(typingId);
    const reply = await getBotReply(message);
    addBotMessage(reply);
  }, 400);
});

function addUserMessage(text) {
  addMessageToWindow(text, "user");
}
function addBotMessage(text) {
  addMessageToWindow(text, "bot");
}
let typingCounter = 0;
function addBotTyping() {
  const id = `typing-${typingCounter++}`;
  const row = document.createElement("div");
  row.className = "message-row bot";
  row.id = id;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = '<span class="typing-dots">•••</span>';
  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return id;
}
function removeBotTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
function addMessageToWindow(text, sender) {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function clearChat() {
  chatWindow.innerHTML = "";
}

// ====== SMART LOCAL MATCHER (Fuse.js) ======
async function getBotReply(userMessage) {
  // Use Fuse.js for semantic search
  const fuse = new Fuse(POLICY_FAQS, {
    includeScore: true,
    keys: ["title", "keywords", "answer"],
    threshold: 0.4, // lower = stricter match
  });

  const results = fuse.search(userMessage);

  if (results.length > 0 && results[0].score < 0.6) {
    const best = results[0].item;
    const linkText = best.link
      ? `\n\nReference: ${best.title} — see: ${best.link}`
      : `\n\nReference: ${best.title}`;
    return best.answer + linkText;
  } else {
    return (
      "I’m not completely sure which policy matches your question. " +
      "Try asking with a few more details — for example: “safe arrival if child is late,” “allergy emergency,” or “sleep supervision checks.”"
    );
  }
}
