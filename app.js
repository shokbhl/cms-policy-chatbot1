// ====== CONFIG ======
const STAFF_ACCESS_CODE = "cms-staff-2025";
const STORAGE_KEY_LOGGED_IN = "schoolPolicyChatbotLoggedIn";

// Cloudflare API URL
const GPT_API_URL = "https://9e0df439.cms-6j8.pages.dev/api/chatbot";

// Local fallback threshold
const LOCAL_CONFIDENCE_THRESHOLD = 8;

// ====== POLICY KNOWLEDGE BASE ======
const POLICY_FAQS = [
  {
    id: "anaphylaxis",
    title: "Anaphylaxis & Severe Allergies",
    answer:
      "Anaphylaxis is a severe allergic reaction. Staff must administer EpiPen immediately, call 911, keep staff with the child, document time and dose, and ensure hospital transfer.",
    link: "https://docs.google.com/document/d/1YWBYRtwwrunMv041-MAh-XBzW9HIRc_h",
    triggers: [/allerg/i, /epipen|epi-pen/i, /anaphyl/i, /reaction/i]
  },
  {
    id: "vulnerable_sector",
    title: "Criminal Reference / Vulnerable Sector Check",
    answer:
      "A current VSC is required before unsupervised contact with children. Renew every 5 years and complete annual Offence Declarations.",
    link: "https://docs.google.com/document/d/1CSk2ip1_ZQVFgK0XbLNzanNHMD_XfTXD",
    triggers: [/vulnerable/i, /police/i, /record/i, /offence/i]
  },
  {
    id: "emergency_management",
    title: "Emergency Management (Lockdown, Evacuation, Disasters)",
    answer:
      "Follow Immediate Response, During Emergency, and Recovery phases. Keep children safe, grab attendance, emergency meds, and follow emergency instructions.",
    link: "https://docs.google.com/document/d/176nOfzH9oSBVWbd1NmJwquiGhK1Tvh9X",
    triggers: [/lockdown/i, /evacu/i, /earthquake|tornado/i, /gas/i]
  },
  {
    id: "fire_safety",
    title: "Fire Safety & Evacuation",
    answer:
      "Escort children to the nearest exit, bring attendance, close windows/doors, take attendance outside, and proceed to emergency shelter if needed.",
    link: "https://docs.google.com/document/d/1J0oYtK4F25qkOwhq0QmOkYIKy2EcCRGc",
    triggers: [/fire/i, /alarm/i, /evacu/i]
  },
  {
    id: "medication",
    title: "Medication Administration",
    answer:
      "Administer only labelled medication with a signed Medication Dispensing Form. Document all doses and store medication securely.",
    link: "https://docs.google.com/document/d/1wlfJ0bwOzgK2qZ-qvK0ghBeCQrFaNvMW",
    triggers: [/medicat/i, /prescript/i, /dose/i]
  },
  {
    id: "behaviour_monitoring",
    title: "Monitoring Behaviour Management (Staff)",
    answer:
      "Staff review guidance on hire and annually; supervisors document daily observations and prohibited practices.",
    link: "https://docs.google.com/document/d/1OdcYClWJs3069UkL5JQ9Ne4gv2VYEybH",
    triggers: [/behavio/i, /discipline/i]
  },
  {
    id: "parent_issues",
    title: "Parent Issues & Concerns",
    answer:
      "Concerns are documented and addressed promptly; staff maintain confidentiality unless legally required; duty to report abuse applies.",
    link: "https://docs.google.com/document/d/1pHAxv4AAjTsho6S9uvxmcI5dIUxsfF_2",
    triggers: [/parent/i, /concern/i, /complain/i]
  },
  {
    id: "playground",
    title: "Playground Safety",
    answer:
      "Daily, monthly, and annual inspections ensure safety; maintain ratios, headcounts, and emergency readiness outdoors.",
    link: "https://docs.google.com/document/d/17T9aic0O_3DeBNx2jXlPCbqZqbkVhoLA",
    triggers: [/playground/i, /outdoor/i]
  },
  {
    id: "program_statement",
    title: "Program Statement Implementation & Prohibited Practices",
    answer:
      "Corporal punishment, harsh language, or deprivation of needs is prohibited. Use positive guidance practices.",
    link: "https://docs.google.com/document/d/1uopwojEYO5vUUeXLSOYa9kseGQ9Sxpy7",
    triggers: [/prohibited/i, /program/i]
  },
  {
    id: "public_health",
    title: "Public Health, Illness & Infection Control",
    answer:
      "Follow Public Health guidance: assess symptoms, send children home when needed, disinfect, and maintain hygiene.",
    link: "https://docs.google.com/document/d/1T_JBLAb6DhIZpCy1jrTx10f18SFRzO8V",
    triggers: [/ill/i, /fever/i, /vomit/i, /infect/i]
  },
  {
    id: "safe_arrival",
    title: "Safe Arrival & Dismissal",
    answer:
      "If a child is absent without notice, contact parents by 10:00 a.m. and escalate if unreachable. Release children only to authorized individuals.",
    link: "https://docs.google.com/document/d/1IpN3To4GJnHFc-EMaT4qkBBTfY6Cvz_h",
    triggers: [/absent/i, /not.*come/i, /attendance/i, /call.*parent/i]
  },
  {
    id: "serious_occurrence",
    title: "Serious Occurrence",
    answer:
      "Includes life-threatening injury, missing child, unsupervised child, or major disruption. Submit CCLS report within 24 hours.",
    link: "https://docs.google.com/document/d/1QYqQgAvqKZiOjr3-3znh39nJQvTMyE9U",
    triggers: [/serious/i, /missing/i]
  },
  {
    id: "sleep_infants",
    title: "Sleep Supervision – Infants",
    answer:
      "Infants sleep on their backs; staff perform visual checks every 15 minutes and record them.",
    link: "https://docs.google.com/document/d/1HoWGu9GNCalQ4QzIVwtIopinMJC79lNX",
    triggers: [/infant/i, /crib/i]
  },
  {
    id: "sleep_toddlers",
    title: "Sleep Supervision – Toddlers & Preschoolers",
    answer:
      "Toddlers/preschoolers use cots; staff stay in room and check every 30 minutes.",
    link: "https://docs.google.com/document/d/1xXe0P_JThb3mRVwP4rtpNT4Gw3vCerec",
    triggers: [/toddler/i, /cot/i]
  },
  {
    id: "staff_development",
    title: "Staff Development & Training",
    answer:
      "All staff receive orientation and ongoing PD; maintain First Aid & CPR Level C.",
    link: "https://docs.google.com/document/d/1VqwU1Gyd8qL0qiMzFMFQZpBUfIr1IVK_",
    triggers: [/training/i, /cpr/i]
  },
  {
    id: "students_volunteers",
    title: "Supervision of Students & Volunteers",
    answer:
      "Students/volunteers never count in ratios and are never left alone with children.",
    link: "https://docs.google.com/document/d/1b2FL-LEuF1y_tx72W0RQTDklT1Kkeen3",
    triggers: [/volunteer/i, /student/i]
  },
  {
    id: "waiting_list",
    title: "Waiting List",
    answer:
      "No fee to join. Priority for siblings, transfers, and staff children.",
    link: "https://docs.google.com/document/d/1anDQ7wth7Hm2L1H2eTp6bul1EiMo-dhh",
    triggers: [/wait/i, /priority/i]
  }
];
// ==== UI ELEMENTS ====
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const chatWindow = document.getElementById("chat-window");
const loginForm = document.getElementById("login-form");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

// ==== LOGIN ====
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (accessCodeInput.value.trim() === STAFF_ACCESS_CODE) {
    localStorage.setItem(STORAGE_KEY_LOGGED_IN, "true");
    showChat();
  } else {
    loginError.textContent = "Incorrect access code.";
  }
});

// ==== LOGOUT ====
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY_LOGGED_IN);
  showLogin();
});

// ==== SCREEN HANDLERS ====
function showLogin() {
  loginScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
}
function showChat() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
}

// ==== CHAT SUBMISSION ====
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message) return;

  addUserMessage(message);
  userInput.value = "";

  addBotTyping();

  const result = await getAIAnswer(message);

  removeBotTyping();
  addBotMessage(result);
});

// ==== LOCAL MATCHER + GPT FALLBACK =====
async function getAIAnswer(msg) {
  msg = msg.toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const p of POLICY_FAQS) {
    let score = 0;
    p.triggers.forEach((regex) => {
      if (regex.test(msg)) score += 5;
    });
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (best && bestScore >= LOCAL_CONFIDENCE_THRESHOLD) {
    return formatAnswer(best);
  }

  try {
    const response = await fetch(GPT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: msg,
        policies: POLICY_FAQS
      })
    });

    const data = await response.json();

    if (data.error || !data.id) {
      return "I’m not fully sure which policy this refers to.";
    }

    const policy = POLICY_FAQS.find((p) => p.id === data.id);
    if (!policy) return "Matched a policy that is not in the database.";

    return formatAnswer(policy);
  } catch {
    return "The AI assistant is unavailable.";
  }
}

// ==== ANSWER FORMAT ====
function formatAnswer(policy) {
  return (
    policy.answer +
    `\n\n🔗 <a href="${policy.link}" target="_blank">${policy.title}</a>`
  );
}

// ==== UI HELPERS ====
function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "message-row user";
  div.innerHTML = `<div class="message-bubble">${text}</div>`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addBotMessage(text) {
  const div = document.createElement("div");
  div.className = "message-row bot";
  div.innerHTML = `<div class="message-bubble">${text}</div>`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

let typingEl = null;
function addBotTyping() {
  typingEl = document.createElement("div");
  typingEl.className = "message-row bot";
  typingEl.innerHTML = `<div class="message-bubble"><span class="typing-dots">•••</span></div>`;
  chatWindow.appendChild(typingEl);
}
function removeBotTyping() {
  if (typingEl) typingEl.remove();
  typingEl = null;
}
