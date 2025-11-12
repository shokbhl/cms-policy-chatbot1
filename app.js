// ====== CONFIG ======
const STAFF_ACCESS_CODE = "cms-staff-2025"; // 🔒 staff-only access code
const STORAGE_KEY_LOGGED_IN = "schoolPolicyChatbotLoggedIn";

// ====== POLICY KNOWLEDGE BASE ======
const POLICY_FAQS = [
  {
    id: "anaphylaxis",
    title: "Anaphylaxis & Severe Allergies",
    keywords: [
      "anaphylaxis","allergy","allergies","epipen","epi-pen","epinephrine","nut","peanut","tree nut","reaction","food allergy"
    ],
    answer:
      "Anaphylaxis is a severe, potentially life-threatening allergic reaction. CMS takes a proactive approach to prevention: labels are checked, foods with 'may contain nuts' are not served, and staff administer EpiPen immediately, call 911, stay with the child, and ensure hospital transfer.",
    link: "https://docs.google.com/document/d/1YWBYRtwwrunMv041-MAh-XBzW9HIRc_h/edit"
  },
  {
    id: "vulnerable_sector",
    title: "Criminal Reference / Vulnerable Sector Check",
    keywords: ["vulnerable sector","vsc","criminal reference","police check","offence declaration","attestation","record check"],
    answer:
      "Employment or volunteer work at CMS requires a clear Vulnerable Sector Check (VSC) before unsupervised contact with children. Renewed every 5 years with annual Offence Declarations in between. All records are securely stored.",
    link: "https://docs.google.com/document/d/1CSk2ip1_ZQVFgK0XbLNzanNHMD_XfTXD/edit"
  },
  {
    id: "emergency_management",
    title: "Emergency Management (Lockdown, Evacuation, Disasters)",
    keywords: ["emergency","lockdown","hold and secure","evacuation","earthquake","gas leak","environmental threat","tornado"],
    answer:
      "CMS follows Immediate Response, Emergency, and Recovery phases. Staff ensure safety, account for children, grab attendance, medications, emergency bag, and follow 911 or emergency services directions.",
    link: "https://docs.google.com/document/d/176nOfzH9oSBVWbd1NmJwquiGhK1Tvh9X/edit"
  },
  {
    id: "fire_safety",
    title: "Fire Safety & Evacuation",
    keywords: ["fire","fire drill","evacuation","alarm","safety","meeting place"],
    answer:
      "During a fire or drill, staff escort children to the nearest safe exit, bring attendance and emergency box, close windows and doors, and take attendance outside. Proceed to emergency shelter sites as directed.",
    link: "https://docs.google.com/document/d/1J0oYtK4F25qkOwhq0QmOkYIKy2EcCRGc/edit"
  },
  {
    id: "medication",
    title: "Medication Administration",
    keywords: ["medication","medicine","prescription","over the counter","doctor","dispensing","form"],
    answer:
      "Only medication with a doctor’s note and original label is administered. A Medication Dispensing Form is signed. Staff verify all details and record each dose. Medications are locked and stored safely.",
    link: "https://docs.google.com/document/d/1wlfJ0bwOzgK2qZ-qvK0ghBeCQrFaNvMW/edit"
  },
  {
    id: "behaviour_monitoring",
    title: "Monitoring Behaviour Management (Staff)",
    keywords: ["behaviour","discipline","guidance","observation","prohibited practices"],
    answer:
      "All staff review CMS behaviour management philosophy on hire and annually. Supervisors monitor positive guidance daily, document observations, and report any prohibited practices immediately.",
    link: "https://docs.google.com/document/d/1OdcYClWJs3069UkL5JQ9Ne4gv2VYEybH/edit"
  },
  {
    id: "parent_issues",
    title: "Parent Issues & Concerns",
    keywords: ["parent","issue","concern","complaint","feedback","cas","abuse","neglect"],
    answer:
      "CMS encourages open communication. Concerns are documented and handled promptly. Staff must report suspected child abuse directly to the Children’s Aid Society. Harassment or discrimination is not tolerated.",
    link: "https://docs.google.com/document/d/1pHAxv4AAjTsho6S9uvxmcI5dIUxsfF_2/edit"
  },
  {
    id: "playground",
    title: "Playground Safety",
    keywords: ["playground","outdoor","equipment","inspection","supervision","ratios"],
    answer:
      "Outdoor play areas meet CSA standards. Daily, monthly, and annual inspections are documented. Unsafe areas are closed until repaired. Staff maintain ratios and constant supervision during outdoor play.",
    link: "https://docs.google.com/document/d/17T9aic0O_3DeBNx2jXlPCbqZqbkVhoLA/edit"
  },
  {
    id: "program_statement",
    title: "Program Statement Implementation & Prohibited Practices",
    keywords: ["program statement","prohibited practices","guidance","discipline","positive guidance","corporal punishment"],
    answer:
      "CMS prohibits corporal punishment, harsh measures, locking exits, or deprivation of needs. Staff must use positive, age-appropriate guidance. Violations lead to disciplinary action or dismissal.",
    link: "https://docs.google.com/document/d/1uopwojEYO5vUUeXLSOYa9kseGQ9Sxpy7/edit"
  },
  {
    id: "public_health",
    title: "Public Health, Illness & Infection Control",
    keywords: ["illness","fever","vomit","infection","public health","outbreak","disinfection","hand hygiene"],
    answer:
      "Children with fever, vomiting, diarrhea, rash, or communicable disease must stay home. Cleaning and disinfection follow Public Health guidelines using approved products. Hand hygiene and glove use required.",
    link: "https://docs.google.com/document/d/1T_JBLAb6DhIZpCy1jrTx10f18SFRzO8V/edit"
  },
  {
    id: "safe_arrival",
    title: "Safe Arrival & Dismissal",
    keywords: ["arrival","dismissal","pickup","drop off","absent","late","no show","child not picked up"],
    answer:
      "Children are only released to authorized persons. If a child is absent without notice, staff contact families by 10:00 a.m. If uncollected by 7:00 p.m., staff call the Children’s Aid Society.",
    link: "https://docs.google.com/document/d/1IpN3To4GJnHFc-EMaT4qkBBTfY6Cvz_h/edit"
  },
  {
    id: "serious_occurrence",
    title: "Serious Occurrence",
    keywords: ["serious occurrence","death","life threatening","missing child","unsupervised","disruption","ccls"],
    answer:
      "Serious occurrences include death, life-threatening injury, missing or unsupervised child, or unplanned disruption. Report via CCLS within 24 hours. Post notice for 10 business days.",
    link: "https://docs.google.com/document/d/1QYqQgAvqKZiOjr3-3znh39nJQvTMyE9U/edit"
  },
  {
    id: "sleep_infants",
    title: "Sleep Supervision – Infants",
    keywords: ["sleep","crib","infant","safe sleep","sids","sleep supervision"],
    answer:
      "Infants sleep on their backs in individual cribs. Staff visually check every 15 minutes for breathing, colour, and distress, recording results. No soft items in cribs.",
    link: "https://docs.google.com/document/d/1HoWGu9GNCalQ4QzIVwtIopinMJC79lNX/edit"
  },
  {
    id: "sleep_toddlers",
    title: "Sleep Supervision – Toddlers & Preschoolers",
    keywords: ["sleep","nap","cot","toddler","preschool","rest time"],
    answer:
      "Toddlers and preschoolers have individual cots. Staff perform visual checks every 30 minutes and record. Any significant change is communicated to parents.",
    link: "https://docs.google.com/document/d/1xXe0P_JThb3mRVwP4rtpNT4Gw3vCerec/edit"
  },
  {
    id: "staff_development",
    title: "Staff Development & Training",
    keywords: ["staff development","training","orientation","first aid","cpr","professional development"],
    answer:
      "CMS provides continuous professional development. All staff attend orientation, meetings, and maintain valid Standard First Aid with CPR Level C.",
    link: "https://docs.google.com/document/d/1VqwU1Gyd8qL0qiMzFMFQZpBUfIr1IVK_/edit"
  },
  {
    id: "students_volunteers",
    title: "Supervision of Students & Volunteers",
    keywords: ["student","volunteer","placement","supervision","field placement"],
    answer:
      "Students and volunteers never replace staff or count in ratios. They must be supervised at all times, review key policies, and never be alone with children.",
    link: "https://docs.google.com/document/d/1b2FL-LEuF1y_tx72W0RQTDklT1Kkeen3/edit"
  },
  {
    id: "waiting_list",
    title: "Waiting List",
    keywords: ["waiting list","waitlist","registration","priority","admission","position on list"],
    answer:
      "CMS does not charge a fee for the waiting list. Priority is given to siblings, transfers, and children of staff. Offers are made on a first-come, first-served basis.",
    link: "https://docs.google.com/document/d/1anDQ7wth7Hm2L1H2eTp6bul1EiMo-dhh/edit"
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
  console.log("Policies loaded:", POLICY_FAQS.length);
  const loggedIn = localStorage.getItem(STORAGE_KEY_LOGGED_IN) === "true";
  if (loggedIn) {
    showChatScreen();
    addBotMessage(
      "Welcome back! 👋 You can ask about any CMS policy — try questions like 'What happens if a child isn’t picked up?' or 'How often do we check sleeping infants?'"
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
    addBotMessage("Hi! I'm your School Policy Assistant 🤖 Ask me about any CMS policy.");
  } else {
    loginError.textContent = "❌ Incorrect access code. Please try again.";
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
  if (typeof Fuse === "undefined") {
    return "⚠️ Smart search not loaded. Check your internet connection or Fuse.js script.";
  }

  const fuse = new Fuse(POLICY_FAQS, {
    includeScore: true,
    keys: ["title", "keywords", "answer"],
    threshold: 0.55,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const results = fuse.search(userMessage);
  console.log("Fuse results:", results);

  if (results.length > 0) {
    const best = results[0].item;
    const linkText = best.link
      ? `\n\nReference: ${best.title} — see: ${best.link}`
      : `\n\nReference: ${best.title}`;
    return best.answer + linkText;
  } else {
    return "I’m not sure which policy matches that. Try rephrasing — for example: 'late pickup', 'allergy reaction', 'sleep check', or 'fire drill'.";
  }
}
