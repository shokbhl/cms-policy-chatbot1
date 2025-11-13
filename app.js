// ====== CONFIG ======
const STAFF_ACCESS_CODE = "cms-staff-2025";
const STORAGE_KEY_LOGGED_IN = "schoolPolicyChatbotLoggedIn";

// ✅ Your Cloudflare API URL (backend function)
const GPT_API_URL = "https://cms-api-final-v2.pages.dev/api/chatbot";

// How confident the local matcher must be before answering without AI
const LOCAL_CONFIDENCE_THRESHOLD = 10;

// ====== POLICY KNOWLEDGE BASE (17 policies) ======
const POLICY_FAQS = [
  {
    id: "anaphylaxis",
    title: "Anaphylaxis & Severe Allergies",
    summary:
      "Anaphylaxis is a severe allergic reaction. Staff must follow the child’s Individual Plan, administer EpiPen at the first sign of anaphylaxis, call 911, keep a calm staff with the child, document dose and time, and ensure transport to hospital even if symptoms improve.",
    link: "https://docs.google.com/document/d/1YWBYRtwwrunMv041-MAh-XBzW9HIRc_h",
    keywords: [
      "anaphylaxis",
      "allergy",
      "allergies",
      "epipen",
      "epi-pen",
      "epinephrine",
      "nut",
      "peanut",
      "reaction",
      "food allergy"
    ],
    triggers: [/allerg/i, /anaphyl/i, /epi-?pen/i, /epinephrin/i, /peanut|tree\s*nut/i, /reaction/i]
  },
  {
    id: "vulnerable_sector",
    title: "Criminal Reference / Vulnerable Sector Check",
    summary:
      "A current Vulnerable Sector Check (VSC) is required before unsupervised contact with children. VSCs are renewed every 5 years and staff complete annual Offence Declarations in between. Individuals with relevant convictions may not provide care.",
    link: "https://docs.google.com/document/d/1CSk2ip1_ZQVFgK0XbLNzanNHMD_XfTXD",
    keywords: [
      "vulnerable sector",
      "vsc",
      "criminal reference",
      "police check",
      "offence declaration",
      "attestation",
      "record check"
    ],
    triggers: [/vulnerable\s*sector/i, /police\s*(check|record)/i, /offen(c|s)e\s*decl/i, /attestation/i]
  },
  {
    id: "emergency_management",
    title: "Emergency Management (Lockdown, Evacuation, Disasters)",
    summary:
      "CMS uses three phases in emergencies: Immediate Response, During the Emergency, and Recovery. Staff must keep children safe and accounted for, bring attendance, emergency contact info, emergency meds and the emergency bag, and follow directions from emergency services for lockdown, hold & secure, evacuation, or environmental threats.",
    link: "https://docs.google.com/document/d/176nOfzH9oSBVWbd1NmJwquiGhK1Tvh9X",
    keywords: [
      "emergency",
      "lockdown",
      "hold and secure",
      "evacuation",
      "meeting place",
      "earthquake",
      "tornado",
      "gas leak",
      "environmental threat",
      "bomb threat"
    ],
    triggers: [/lock\s*down/i, /hold\s*(and|&)\s*secure/i, /evacu/i, /earthquake|tornado/i, /gas\s*leak/i]
  },
  {
    id: "fire_safety",
    title: "Fire Safety & Evacuation",
    summary:
      "In the event of fire or fire drill, staff escort children to the nearest safe exit, bring attendance and emergency box, close windows and doors, and take attendance outside. They may proceed to the designated emergency shelter if instructed. Supervisors ensure staff are trained and exits remain unobstructed.",
    link: "https://docs.google.com/document/d/1J0oYtK4F25qkOwhq0QmOkYIKy2EcCRGc",
    keywords: ["fire", "fire drill", "alarm", "evacuation", "emergency shelter", "exit", "meeting place"],
    triggers: [/fire/i, /alarm/i, /evacu/i, /exit/i, /shelter/i]
  },
  {
    id: "medication",
    title: "Medication Administration",
    summary:
      "CMS only administers medication (prescription or over-the-counter) that is in its original labelled container and accompanied by a doctor’s note and a completed Medication Dispensing Form. Staff verify the label, document each dose, and store medication in locked bags (refrigerated or non-refrigerated) with restricted access.",
    link: "https://docs.google.com/document/d/1wlfJ0bwOzgK2qZ-qvK0ghBeCQrFaNvMW",
    keywords: [
      "medication",
      "medicine",
      "prescription",
      "over the counter",
      "doctor",
      "dose",
      "dispensing",
      "label",
      "medication form"
    ],
    triggers: [/medicat|prescript|over[-\s]*the[-\s]*counter/i, /dose|dispens/i, /doctor/i, /label/i]
  },
  {
    id: "behaviour_monitoring",
    title: "Monitoring Behaviour Management (Staff)",
    summary:
      "Behaviour guidance practices and prohibited practices are reviewed on hire and annually. Supervisors complete ongoing observations and formal monitoring to ensure staff use positive, age-appropriate guidance and do not use prohibited practices. Records are kept for at least two years.",
    link: "https://docs.google.com/document/d/1OdcYClWJs3069UkL5JQ9Ne4gv2VYEybH",
    keywords: ["behaviour", "behavior", "discipline", "guidance", "observation", "prohibited practices"],
    triggers: [/behaviou?r/i, /discipline/i, /prohibited\s*pract/i, /obser(vation|ve)/i]
  },
  {
    id: "parent_issues",
    title: "Parent Issues & Concerns",
    summary:
      "CMS encourages open communication. Parent issues and concerns are documented and addressed promptly and respectfully, while maintaining confidentiality unless information must be shared with authorities. Staff have a duty to report suspected abuse or neglect directly to CAS.",
    link: "https://docs.google.com/document/d/1pHAxv4AAjTsho6S9uvxmcI5dIUxsfF_2",
    keywords: ["parent", "issue", "concern", "complaint", "feedback", "harassment", "discrimination", "cas", "abuse", "neglect"],
    triggers: [/parent/i, /complain|concern|issue/i, /harass|discrimin/i, /duty\s*to\s*report|CAS/i]
  },
  {
    id: "playground",
    title: "Playground Safety",
    summary:
      "Playgrounds are inspected daily, monthly, and annually. Unsafe areas are blocked off until repaired. Staff maintain ratios outdoors, bring emergency bags, do head counts at transitions, and position themselves to provide constant supervision and safe, engaging outdoor play.",
    link: "https://docs.google.com/document/d/17T9aic0O_3DeBNx2jXlPCbqZqbkVhoLA",
    keywords: ["playground", "outdoor", "equipment", "inspection", "ratios", "supervision outdoors", "gross motor"],
    triggers: [/playground|outdoor/i, /inspect/i, /ratio/i, /supervis/i]
  },
  {
    id: "program_statement",
    title: "Program Statement Implementation & Prohibited Practices",
    summary:
      "The Program Statement outlines CMS philosophy and expectations. Corporal punishment, harsh or degrading treatment, confinement, and deprivation of basic needs are strictly prohibited. Staff use positive, age-appropriate guidance; violations lead to progressive discipline up to and including dismissal.",
    link: "https://docs.google.com/document/d/1uopwojEYO5vUUeXLSOYa9kseGQ9Sxpy7",
    keywords: ["program statement", "prohibited practices", "guidance", "discipline", "positive guidance", "corporal punishment"],
    triggers: [/program\s*statement/i, /prohibited\s*pract/i, /corporal|harsh|degrad/i]
  },
  {
    id: "public_health",
    title: "Public Health, Illness & Infection Control",
    summary:
      "CMS follows Toronto Public Health guidelines. Children with certain symptoms (e.g., fever, vomiting, diarrhea, undiagnosed rash) may be excluded and sent home. Staff follow strict hand hygiene, cleaning and disinfection routines, and enhanced measures during outbreaks, notifying Public Health as required.",
    link: "https://docs.google.com/document/d/1T_JBLAb6DhIZpCy1jrTx10f18SFRzO8V",
    keywords: [
      "illness",
      "sick",
      "fever",
      "vomit",
      "vomiting",
      "diarrhea",
      "infection",
      "public health",
      "outbreak",
      "disinfection",
      "hand hygiene",
      "diapering"
    ],
    triggers: [/ill|sick/i, /fever|vomit|diarrh/i, /infection|outbreak/i, /hand\s*hygiene|disinfect|clean/i]
  },
  {
    id: "safe_arrival",
    title: "Safe Arrival & Dismissal",
    summary:
      "The Safe Arrival and Dismissal Policy ensures children are only released to authorized individuals. If a child is absent without notice, staff begin contacting parents by 10:00 a.m. and escalate to emergency contacts if there is no response. For late pick-ups, staff continue attempts to reach families and contact CAS if no one is reachable by the specified time.",
    link: "https://docs.google.com/document/d/1IpN3To4GJnHFc-EMaT4qkBBTfY6Cvz_h",
    keywords: [
      "arrival",
      "dismissal",
      "pickup",
      "pick up",
      "drop off",
      "absent",
      "no show",
      "late pickup",
      "photo id",
      "authorize",
      "attendance"
    ],
    triggers: [
      /absen/i,
      /didn.?t\s*(come|arrive)/i,
      /not\s*(come|arrive)/i,
      /no\s*show/i,
      /not\s*here/i,
      /attendance/i,
      /(call|contact|notify|inform)\s*(the\s*)?parent/i,
      /pick\s*up/i,
      /dismiss/i,
      /drop\s*off|arrival/i
    ]
  },
  {
    id: "serious_occurrence",
    title: "Serious Occurrence",
    summary:
      "Serious occurrences include death, life-threatening injury or illness, missing or unsupervised children, and unplanned disruptions that pose risks. Staff first address immediate safety, then report through CCLS within 24 hours and post a Serious Occurrence Notification for families for at least 10 business days.",
    link: "https://docs.google.com/document/d/1QYqQgAvqKZiOjr3-3znh39nJQvTMyE9U",
    keywords: [
      "serious occurrence",
      "death",
      "life threatening",
      "missing child",
      "unsupervised child",
      "disruption",
      "ccls",
      "notification form"
    ],
    triggers: [/serious\s*occ/i, /life[-\s]*threat/i, /missing|unsupervised\s*child/i, /ccls/i, /notification/i]
  },
  {
    id: "sleep_infants",
    title: "Sleep Supervision – Infants",
    summary:
      "Infants are placed on their backs to sleep unless a physician provides different written instructions. Each infant has a labelled crib free of pillows and soft items. Staff conduct and document direct visual checks every 15 minutes and ensure sufficient light to safely observe infants.",
    link: "https://docs.google.com/document/d/1HoWGu9GNCalQ4QzIVwtIopinMJC79lNX",
    keywords: ["sleep", "crib", "infant", "safe sleep", "sids", "sleep supervision infant"],
    triggers: [/infant|baby/i, /crib/i, /(sleep|nap)/i, /15\s*min/i]
  },
  {
    id: "sleep_toddlers",
    title: "Sleep Supervision – Toddlers & Preschoolers",
    summary:
      "Toddlers and preschoolers are assigned labelled cots. Staff remain in the room, maintain enough light for safe supervision, and complete direct visual checks at least every 30 minutes, recording checks on the sleep tracking sheet.",
    link: "https://docs.google.com/document/d/1xXe0P_JThb3mRVwP4rtpNT4Gw3vCerec",
    keywords: ["sleep", "nap", "cot", "toddler", "preschool", "rest time", "sleep supervision toddler"],
    triggers: [/toddler|preschool/i, /cot/i, /(sleep|nap)/i, /30\s*min/i]
  },
  {
    id: "staff_development",
    title: "Staff Development & Training",
    summary:
      "CMS provides orientation for new staff, students, and volunteers, and supports ongoing professional development through meetings, workshops, conferences, and self-directed learning. All staff must maintain Standard First Aid with CPR-C.",
    link: "https://docs.google.com/document/d/1VqwU1Gyd8qL0qiMzFMFQZpBUfIr1IVK_",
    keywords: ["staff development", "training", "professional development", "orientation", "first aid", "cpr"],
    triggers: [/training|pd|professional/i, /first\s*aid|cpr/i, /orientation/i]
  },
  {
    id: "students_volunteers",
    title: "Supervision of Students & Volunteers",
    summary:
      "Students and volunteers support but never replace staff and are never counted in ratios. They are never left alone with children and must always be supervised by a staff member. They review and sign key policies and maintain confidentiality and professionalism.",
    link: "https://docs.google.com/document/d/1b2FL-LEuF1y_tx72W0RQTDklT1Kkeen3",
    keywords: ["student", "volunteer", "placement", "supervision of students", "supervision of volunteers", "field placement"],
    triggers: [/student|volunteer/i, /placement/i, /left\s*alone/i, /mentor/i]
  },
  {
    id: "waiting_list",
    title: "Waiting List",
    summary:
      "CMS does not charge a fee to join the waiting list. Priority goes to CMS transfers, siblings of current students, and children of CMS staff. Offers are made on a first-come, first-served basis based on application date.",
    link: "https://docs.google.com/document/d/1anDQ7wth7Hm2L1H2eTp6bul1EiMo-dhh",
    keywords: ["waiting list", "waitlist", "registration fee", "priority", "admission", "position on list"],
    triggers: [/wait\s*list|waiting/i, /priority/i, /admiss|register/i, /position/i]
  }
];

// ====== ELEMENTS ======
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const chatWindow = document.getElementById("chat-window");
const loginForm = document.getElementById("login-form");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const accessCodeInput = document.getElementById("access-code");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

// ====== INIT ======
document.addEventListener("DOMContentLoaded", () => {
  const loggedIn = localStorage.getItem(STORAGE_KEY_LOGGED_IN) === "true";
  if (loggedIn) {
    showChatScreen();
    addBotMessage(
      "Welcome back! You can ask me detailed questions about CMS policies. For example: “What happens if a child is picked up late?” or “How often do we check sleeping infants?”"
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
    addBotMessage(
      "Hi! I'm your CMS Policy Assistant. Ask me anything about arrival, illness, emergencies, volunteers, playground, etc. I’ll answer and give you a clickable policy reference."
    );
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

  try {
    const reply = await getBotReply(message);
    removeBotTyping(typingId);
    addBotMessage(reply, true); // true = treat as HTML
  } catch (err) {
    console.error(err);
    removeBotTyping(typingId);
    addBotMessage(
      "Something went wrong while answering. Please try again, or rephrase your question.",
      false
    );
  }
});

function addUserMessage(text) {
  addMessageToWindow(text, "user");
}

function addBotMessage(text, isHtml = false) {
  addMessageToWindow(text, "bot", isHtml);
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

function addMessageToWindow(text, sender, isHtml = false) {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (sender === "bot" && isHtml) {
    bubble.innerHTML = text; // safe because only our own HTML goes here
  } else {
    bubble.textContent = text; // user text is always treated as plain text
  }

  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearChat() {
  chatWindow.innerHTML = "";
}

// ====== LOCAL MATCHER ======
function getBestLocalPolicy(userMessage) {
  const msg = userMessage.toLowerCase();
  let bestPolicy = null;
  let bestScore = 0;

  POLICY_FAQS.forEach((policy) => {
    let score = 0;

    // keyword hits
    policy.keywords.forEach((kw) => {
      if (msg.includes(kw.toLowerCase())) score += 2;
    });

    // regex triggers
    policy.triggers.forEach((regex) => {
      if (regex.test(msg)) score += 5;
    });

    if (score > bestScore) {
      bestScore = score;
      bestPolicy = policy;
    }
  });

  return { policy: bestPolicy, score: bestScore };
}

function formatPolicyAnswer(policy) {
  const refLink = policy.link
    ? `<br><br>🔗 Reference: <a href="${policy.link}" target="_blank" rel="noopener noreferrer">${policy.title}</a>`
    : "";

  return `${policy.summary}${refLink}`;
}

// ====== MAIN BOT LOGIC (LOCAL + API FALLBACK) ======
async function getBotReply(userMessage) {
  // 1) Try local high-confidence match first
  const { policy: localPolicy, score } = getBestLocalPolicy(userMessage);

  if (localPolicy && score >= LOCAL_CONFIDENCE_THRESHOLD) {
    return formatPolicyAnswer(localPolicy);
  }

  // 2) If not confident, try Cloudflare API (AI)
  try {
    const response = await fetch(GPT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: userMessage,
        // send minimal data to backend
        policies: POLICY_FAQS.map((p) => ({
          id: p.id,
          title: p.title,
          summary: p.summary
        }))
      })
    });

    if (!response.ok) {
      console.warn("API not OK, status =", response.status);
      // fall back to local if we had *some* match
      if (localPolicy) return formatPolicyAnswer(localPolicy);
      return genericFallback();
    }

    const data = await response.json();

    // Expecting something like: { id: "safe_arrival", answer: "..." }
    if (data && data.id) {
      const chosen = POLICY_FAQS.find((p) => p.id === data.id);
      if (chosen) {
        // Backend might add a customized answer; if not, use summary
        const answerText = data.answer && typeof data.answer === "string"
          ? data.answer
          : chosen.summary;
        const refLink = chosen.link
          ? `<br><br>🔗 Reference: <a href="${chosen.link}" target="_blank" rel="noopener noreferrer">${chosen.title}</a>`
          : "";
        return `${answerText}${refLink}`;
      }
    }

    // If backend responds but we can't use the result:
    if (localPolicy) return formatPolicyAnswer(localPolicy);
    return genericFallback();
  } catch (err) {
    console.error("Error calling GPT API:", err);
    if (localPolicy) return formatPolicyAnswer(localPolicy);
    return genericFallback();
  }
}

function genericFallback() {
  return (
    "I’m not completely sure which policy you mean. You can try rephrasing with a few key words, " +
    "for example: “safe arrival if a child is absent”, “allergy emergency”, “sleep checks for infants”, or “volunteer supervision rules”."
  );
}
