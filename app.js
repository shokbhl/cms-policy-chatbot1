// ====== CONFIG ======
const STAFF_ACCESS_CODE = "cms-staff-2025";
const STORAGE_KEY_LOGGED_IN = "schoolPolicyChatbotLoggedIn";

// 🔁 Change this AFTER you deploy the Cloudflare function
// It will look like: "https://your-project-name.pages.dev/api/chatbot"
const GPT_API_URL = "https://YOUR-CLOUDFLARE-PROJECT.pages.dev/api/chatbot";

// Only answer locally when we are VERY sure
const LOCAL_CONFIDENCE_THRESHOLD = 10;

// ====== POLICY KNOWLEDGE BASE (17 total) ======
const POLICY_FAQS = [
  {
    id: "anaphylaxis",
    intent: "allergy",
    title: "Anaphylaxis & Severe Allergies",
    keywords: ["anaphylaxis","allergy","allergies","epipen","epi-pen","epinephrine","nut","peanut","tree nut","reaction","food allergy"],
    phrases: ["severe allergy reaction","use epipen","allergy emergency","anaphylactic","administer epinephrine"],
    triggers: [/allerg/i,/anaphyl/i,/epi-?pen/i,/epinephrin/i,/(peanut|tree\s*nut)/i,/reaction/i],
    answer:
      "Anaphylaxis is a severe allergic reaction. Staff must administer EpiPen immediately, call 911, keep a calm staff with the child, document the dose/time, and ensure hospital transfer even if symptoms improve.",
    link: "https://docs.google.com/document/d/1YWBYRtwwrunMv041-MAh-XBzW9HIRc_h"
  },
  {
    id: "vulnerable_sector",
    intent: "vsc",
    title: "Criminal Reference / Vulnerable Sector Check",
    keywords: ["vulnerable sector","vsc","criminal reference","police check","offence declaration","attestation","record check"],
    phrases: ["vulnerable sector check","police reference check","offence declaration","employer attestation"],
    triggers: [/vulnerable\s*sector/i,/police\s*(check|record)/i,/offen(c|s)e\s*decl/i,/attestation/i],
    answer:
      "Staff/volunteers require a current Vulnerable Sector Check before unsupervised contact with children. Renew every 5 years; complete annual Offence Declarations in intervening years.",
    link: "https://docs.google.com/document/d/1CSk2ip1_ZQVFgK0XbLNzanNHMD_XfTXD"
  },
  {
    id: "emergency_management",
    intent: "emergency_mgmt",
    title: "Emergency Management (Lockdown, Evacuation, Disasters)",
    keywords: ["emergency","lockdown","hold and secure","evacuation","earthquake","tornado","gas leak","environmental threat","bomb threat"],
    phrases: ["hold & secure","hold and secure","lock down","emergency phases","evacuation site","unsafe to return"],
    triggers: [/lock\s*down/i,/hold\s*(and|&)\s*secure/i,/evacu/i,/earthquake|tornado/i,/gas\s*leak/i,/environmental\s*threat/i],
    answer:
      "CMS follows three phases: Immediate Response, During the Emergency, and Recovery. Keep children safe/accounted for, grab attendance, meds, emergency bag, and follow emergency services’ directions.",
    link: "https://docs.google.com/document/d/176nOfzH9oSBVWbd1NmJwquiGhK1Tvh9X"
  },
  {
    id: "fire_safety",
    intent: "fire",
    title: "Fire Safety & Evacuation",
    keywords: ["fire","fire drill","alarm","evacuation","emergency shelter","exit","meeting place"],
    phrases: ["fire alarm rings","fire evacuation","fire drill procedure","nearest safe exit"],
    triggers: [/fire/i,/alarm/i,/evacu/i,/exit/i,/shelter/i],
    answer:
      "Escort children to the nearest safe exit, bring attendance & emergency box, close windows/doors, take attendance outside, and proceed to emergency shelter if directed.",
    link: "https://docs.google.com/document/d/1J0oYtK4F25qkOwhq0QmOkYIKy2EcCRGc"
  },
  {
    id: "medication",
    intent: "medication",
    title: "Medication Administration",
    keywords: ["medication","medicine","prescription","over the counter","doctor","dose","dispensing","label","form"],
    phrases: ["medication form","administer medicine","giving medicine at school","original labelled container"],
    triggers: [/medicat|prescript|over[-\s]*the[-\s]*counter/i,/dose|dispens/i,/doctor/i,/label/i,/medication\s*form/i],
    answer:
      "Only prescribed/authorized medication in original labelled container is administered with a signed Medication Dispensing Form. Verify label, document every dose, store in locked bags.",
    link: "https://docs.google.com/document/d/1wlfJ0bwOzgK2qZ-qvK0ghBeCQrFaNvMW"
  },
  {
    id: "behaviour_monitoring",
    intent: "behaviour",
    title: "Monitoring Behaviour Management (Staff)",
    keywords: ["behaviour","behavior","discipline","guidance","observation","prohibited practices"],
    phrases: ["behaviour monitoring","prohibited practices monitoring","performance appraisal"],
    triggers: [/behaviou?r/i,/discipline/i,/prohibited\s*pract/i,/obser(vation|ve)/i],
    answer:
      "Staff review behaviour guidance on hire and annually. Supervisors observe daily, document, and address any prohibited practices immediately; records retained for at least two years.",
    link: "https://docs.google.com/document/d/1OdcYClWJs3069UkL5JQ9Ne4gv2VYEybH"
  },
  {
    id: "parent_issues",
    intent: "parent_issues",
    title: "Parent Issues & Concerns",
    keywords: ["parent","issue","concern","complaint","feedback","harassment","discrimination","cas","abuse","neglect"],
    phrases: ["parent complaint","duty to report","contact within 1–2 business days","investigation respectfully"],
    triggers: [/parent/i,/complain|concern|issue/i,/harass|discrimin/i,/duty\s*to\s*report|CAS/i],
    answer:
      "Concerns are documented and addressed promptly and respectfully. Maintain confidentiality unless required to share with authorities. Duty to report suspected abuse directly to CAS.",
    link: "https://docs.google.com/document/d/1pHAxv4AAjTsho6S9uvxmcI5dIUxsfF_2"
  },
  {
    id: "playground",
    intent: "playground",
    title: "Playground Safety",
    keywords: ["playground","outdoor","equipment","inspection","ratios","supervision outdoors","gross motor"],
    phrases: ["playground inspection","outdoor supervision","CSA play space","repair log"],
    triggers: [/playground|outdoor/i,/inspect/i,/ratio/i,/supervis/i],
    answer:
      "Daily, monthly, and annual inspections are documented; unsafe areas are closed until repaired. Maintain ratios, bring emergency bag, do headcounts at transitions, and position staff for full coverage.",
    link: "https://docs.google.com/document/d/17T9aic0O_3DeBNx2jXlPCbqZqbkVhoLA"
  },
  {
    id: "program_statement",
    intent: "program",
    title: "Program Statement Implementation & Prohibited Practices",
    keywords: ["program statement","prohibited practices","guidance","discipline","positive guidance","corporal punishment"],
    phrases: ["prohibited practices list","positive guidance","graduated discipline"],
    triggers: [/program\s*statement/i,/prohibited\s*pract/i,/corporal|harsh|degrad/i],
    answer:
      "CMS strictly prohibits corporal punishment, harsh/degrading measures, deprivation of basic needs, or confinement. Staff must use positive, age-appropriate guidance. Violations lead to discipline up to dismissal.",
    link: "https://docs.google.com/document/d/1uopwojEYO5vUUeXLSOYa9kseGQ9Sxpy7"
  },
  {
    id: "public_health",
    intent: "illness",
    title: "Public Health, Illness & Infection Control",
    keywords: ["illness","sick","fever","vomit","vomiting","diarrhea","infection","public health","outbreak","disinfection","hand hygiene","diapering"],
    phrases: ["illness policy","send home sick","isolation & return","approved disinfectants","line list"],
    triggers: [/ill|sick/i,/fever|vomit|diarrh/i,/infection|outbreak/i,/hand\s*hygiene|disinfect|clean/i],
    answer:
      "CMS follows Toronto Public Health guidance: assess symptoms, send home when indicated, clean/disinfect with approved products, use strict hand hygiene, proper diapering/toileting, and maintain outbreak line lists when required.",
    link: "https://docs.google.com/document/d/1T_JBLAb6DhIZpCy1jrTx10f18SFRzO8V"
  },
  {
    id: "safe_arrival",
    intent: "attendance",
    title: "Safe Arrival & Dismissal",
    keywords: ["arrival","dismissal","pickup","pick up","drop off","absent","no show","late pickup","photo id","authorize","attendance"],
    phrases: ["child not picked up","late pickup procedure","safe dismissal","release to authorized","call parents by 10:00 a.m.","absent without notice"],
    triggers: [
      /absen/i,/didn.?t\s*(come|arrive)/i,/not\s*(come|arrive)/i,/no\s*show/i,/not\s*here/i,
      /attendance/i,/(call|contact|notify|inform)\s*(the\s*)?parent/i,/pick\s*up/i,/dismiss/i,/drop\s*off|arrival/i
    ],
    answer:
      "Children are only released to parents/guardians or individuals authorized in writing. If a child is absent without prior notice, staff contact parents/guardians by 10:00 a.m. and escalate to emergency contacts if they cannot be reached. For late pickup, staff escalate to emergency contacts; if no one is reachable by 7:00 p.m., staff must contact the Children’s Aid Society and follow their directions.",
    link: "https://docs.google.com/document/d/1IpN3To4GJnHFc-EMaT4qkBBTfY6Cvz_h"
  },
  {
    id: "serious_occurrence",
    intent: "serious_occurrence",
    title: "Serious Occurrence",
    keywords: ["serious occurrence","death","life threatening","missing child","unsupervised child","disruption","ccls","notification form"],
    phrases: ["serious occurrence report","post notification 10 business days","submit within 24 hours"],
    triggers: [/serious\s*occ/i,/life[-\s]*threat/i,/missing|unsupervised\s*child/i,/ccls/i,/notification/i],
    answer:
      "Serious occurrences include death, life-threatening injury or illness, a missing or unsupervised child, or a major disruption affecting health and safety. Staff address immediate safety first, then submit a Serious Occurrence Report in CCLS within 24 hours and post a notification form for at least 10 business days.",
    link: "https://docs.google.com/document/d/1QYqQgAvqKZiOjr3-3znh39nJQvTMyE9U"
  },
  {
    id: "sleep_infants",
    intent: "sleep_infants",
    title: "Sleep Supervision – Infants",
    keywords: ["sleep","crib","infant","safe sleep","sids","sleep supervision infant"],
    phrases: ["infant sleep checks every 15 minutes","back to sleep","crib inspection"],
    triggers: [/infant|baby/i,/crib/i,/(sleep|nap)/i,/15\s*min/i],
    answer:
      "Infants sleep on their backs in labelled cribs with no pillows, duvets or bumper pads. Staff conduct direct visual checks every 15 minutes with enough light to see breathing and colour, and record these checks on the sleep tracking sheet. Infants sleeping in strollers or other equipment are moved to a crib as soon as possible.",
    link: "https://docs.google.com/document/d/1HoWGu9GNCalQ4QzIVwtIopinMJC79lNX"
  },
  {
    id: "sleep_toddlers",
    intent: "sleep_toddlers",
    title: "Sleep Supervision – Toddlers & Preschoolers",
    keywords: ["sleep","nap","cot","toddler","preschool","rest time","sleep supervision toddler"],
    phrases: ["sleep checks every 30 minutes","sleep tracking sheet"],
    triggers: [/toddler|preschool/i,/cot/i,/(sleep|nap)/i,/30\s*min/i],
    answer:
      "Each toddler and preschool child has a labelled cot. Staff remain present in the room, conduct direct visual checks at least every 30 minutes, and record them on the sleep tracking sheet. Significant changes in sleep patterns or concerns are shared with families.",
    link: "https://docs.google.com/document/d/1xXe0P_JThb3mRVwP4rtpNT4Gw3vCerec"
  },
  {
    id: "staff_development",
    intent: "staff_dev",
    title: "Staff Development & Training",
    keywords: ["staff development","training","professional development","orientation","first aid","cpr"],
    phrases: ["professional learning","annual training","staff meetings","workshops","conferences"],
    triggers: [/training|pd|professional/i,/first\s*aid|cpr/i,/orientation/i],
    answer:
      "New staff, students and volunteers receive orientation on CMS policies, Public Health, Fire Safety and Ministry requirements. Ongoing professional development is provided through meetings, workshops, conferences and self-directed learning. All staff maintain Standard First Aid with CPR Level C.",
    link: "https://docs.google.com/document/d/1VqwU1Gyd8qL0qiMzFMFQZpBUfIr1IVK_"
  },
  {
    id: "students_volunteers",
    intent: "volunteers",
    title: "Supervision of Students & Volunteers",
    keywords: ["student","volunteer","placement","supervision of students","supervision of volunteers","field placement"],
    phrases: ["never left alone with children","mentoring teacher","wear identification","confidentiality"],
    triggers: [/student|volunteer/i,/placement/i,/left\s*alone/i,/mentor/i],
    answer:
      "Students and volunteers support the program but never replace staff or count in ratios. They are never left alone with children, must wear identification, maintain confidentiality and follow CMS policies. A mentoring teacher provides guidance and ensures expectations are clear.",
    link: "https://docs.google.com/document/d/1b2FL-LEuF1y_tx72W0RQTDklT1Kkeen3"
  },
  {
    id: "waiting_list",
    intent: "waiting_list",
    title: "Waiting List",
    keywords: ["waiting list","waitlist","registration fee","priority","admission","position on list"],
    phrases: ["no fee to join waitlist","priority admission","first-come, first-served"],
    triggers: [/wait\s*list|waiting/i,/priority/i,/admiss|register/i,/position/i],
    answer:
      "There is no fee to place a child on the waiting list. Priority is given to transfers from other CMS locations, siblings of current students, and children of CMS employees. Offers are made on a first-come, first-served basis according to the date of application, and families may ask about their position without seeing other families’ information.",
    link: "https://docs.google.com/document/d/1anDQ7wth7Hm2L1H2eTp6bul1EiMo-dhh"
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
      "Welcome back! Ask about any CMS policy — e.g., “late pickup”, “sleep checks for infants”, “fire drill”, “VSC”, or “serious occurrence”."
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
    addBotMessage("Hi! I'm your CMS Policy Assistant. Ask me about any policy.");
  } else {
    loginError.textContent = "❌ Incorrect access code. Try again.";
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
    const replyHTML = await getBotReply(message);
    removeBotTyping(typingId);
    addBotMessage(replyHTML, true);
  } catch (err) {
    removeBotTyping(typingId);
    addBotMessage("⚠️ Something went wrong. Please try again in a moment.", false);
  }
});

function addUserMessage(text) {
  addMessageToWindow(text, "user", false);
}
function addBotMessage(html, isHTML = true) {
  addMessageToWindow(html, "bot", isHTML);
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
function addMessageToWindow(content, sender, isHTML = false) {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = isHTML ? content : content.replace(/\n/g, "<br>");
  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function clearChat() {
  chatWindow.innerHTML = "";
}

// ====== TEXT NORMALIZATION & SCORING ======
const SYNONYMS = [
  ["pick up","pickup","collection","collect"],
  ["drop off","dropoff","arrival"],
  ["parent","guardian","caregiver"],
  ["photo id","identification","id"],
  ["fever","temperature"],
  ["vomit","vomiting"],
  ["diarrhea","diarrhoea"],
  ["epi-pen","epipen"],
  ["lockdown","lock down"],
  ["hold and secure","hold & secure"],
  ["kids","children","students","child","student"],
  ["teacher","staff","employee"]
];

function normalize(text) {
  let t = " " + text.toLowerCase() + " ";
  SYNONYMS.forEach(group => {
    const main = group[0];
    group.slice(1).forEach(alt => {
      const re = new RegExp(`\\b${alt.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "g");
      t = t.replace(re, main);
    });
  });
  return t.trim();
}

function wordHits(msg, terms = []) {
  let s = 0;
  for (const t of terms) {
    const re = new RegExp(`\\b${t.toLowerCase().replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");
    if (re.test(msg)) s += 3;
  }
  return s;
}

function phraseHits(msg, phrases = []) {
  let s = 0;
  for (const p of phrases) {
    const re = new RegExp(p.toLowerCase().replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&"), "i");
    if (re.test(msg)) s += 5;
  }
  return s;
}

function triggerHits(msg, triggers = []) {
  let s = 0;
  for (const r of triggers) {
    if (r.test(msg)) s += 6;
  }
  return s;
}

// Optional: coarse intent detection (for future use / analytics)
function detectIntent(msg) {
  const intentMap = {
    attendance: /(absen|didn.?t\s*(come|arrive)|not\s*(come|arrive)|no\s*show|not\s*here|attendance|(call|contact|notify|inform)\s*(the\s*)?parent|pick\s*up|dismiss|drop\s*off|arrival)/i,
    fire: /(fire|alarm|smoke|evacuate|exit|drill)/i,
    allergy: /(allergy|anaphyl|epipen|epinephrin|peanut|tree\s*nut|reaction)/i,
    illness: /(ill|sick|fever|vomit|diarrh|infection|public\s*health|outbreak|disinfect|hand\s*hygiene|diaper)/i,
    serious_occurrence: /(serious\s*occ|life[-\s]*threat|missing|unsupervised\s*child|ccls|notification)/i,
    sleep_infants: /(infant|baby).*(sleep|nap)|\bcrib\b|15\s*min/i,
    sleep_toddlers: /(toddler|preschool).*(sleep|nap)|\bcot\b|30\s*min/i,
    volunteers: /(student|volunteer|placement|left\s*alone|mentor)/i,
    vsc: /(vulnerable\s*sector|police\s*check|offen(c|s)e\s*decl|attestation)/i,
    playground: /(playground|outdoor|equipment|inspection|ratio|supervision)/i,
    program: /(program\s*statement|prohibited\s*practice|corporal|harsh|degrad)/i,
    medication: /(medicat|prescript|over[-\s]*the[-\s]*counter|dose|dispens|label|medication\s*form)/i,
    behaviour: /(behaviou?r|discipline|prohibited\s*practice|obser(vation|ve))/i,
    staff_dev: /(training|pd|professional|first\s*aid|cpr|orientation)/i,
    parent_issues: /(parent).*(complain|concern|issue|harass|discrimin|duty\s*to\s*report|cas)/i,
    waiting_list: /(wait\s*list|waiting|priority|admiss|register|position)/i,
    emergency_mgmt: /(lock\s*down|hold\s*(and|&)\s*secure|evacu|earthquake|tornado|gas\s*leak|environmental\s*threat)/i
  };

  const intents = [];
  Object.entries(intentMap).forEach(([name, rx]) => {
    if (rx.test(msg)) intents.push(name);
  });
  return intents;
}

function renderAnswer(policy) {
  const ref = policy.link
    ? `<br><br>Reference: <a href="${policy.link}" target="_blank" rel="noopener">${policy.title}</a>`
    : `<br><br>Reference: ${policy.title}`;
  return `${policy.answer}${ref}`;
}

// ====== GPT FALLBACK (via Cloudflare API) ======
async function askGptPolicy(question) {
  if (!GPT_API_URL || GPT_API_URL.includes("YOUR-CLOUDFLARE-PROJECT")) {
    return "⚠️ The AI assistant is not fully configured yet (missing API URL). Please contact the administrator.";
  }

  const policiesPayload = POLICY_FAQS.map(p => ({
    id: p.id,
    title: p.title,
    summary: p.answer
  }));

  try {
    const res = await fetch(GPT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        policies: policiesPayload
      })
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    if (data && data.id && data.answer) {
      const policy = POLICY_FAQS.find(p => p.id === data.id);
      if (policy) {
        return (
          data.answer +
          `<br><br>Reference: <a href="${policy.link}" target="_blank" rel="noopener">${policy.title}</a>`
        );
      }
      return data.answer;
    }

    if (data && data.answer) {
      return data.answer;
    }

    return "⚠️ I couldn’t interpret the AI response. Please try asking in a different way or contact the administrator.";
  } catch (err) {
    console.error("GPT fallback error:", err);
    return "⚠️ I had trouble contacting the AI assistant. Please try again later.";
  }
}

// ====== HYBRID ANSWER LOGIC ======
async function getBotReply(userMessage) {
  const raw = userMessage.trim();
  if (!raw) return "Please enter a question about a CMS policy.";

  const msg = normalize(raw);

  // 1) Try local rule-based matching first
  const intents = detectIntent(msg);
  let candidates = POLICY_FAQS;
  if (intents.length > 0) {
    const intentSet = new Set(intents);
    const filtered = POLICY_FAQS.filter(p => intentSet.has(p.intent));
    if (filtered.length > 0) {
      candidates = filtered;
    }
  }

  let best = null;
  let topScore = -1;

  candidates.forEach(item => {
    let score = 0;
    score += triggerHits(msg, item.triggers || []);
    score += phraseHits(msg, item.phrases || []);
    score += wordHits(msg, item.keywords || []);

    const titleTokens = (item.title || "").toLowerCase().split(/[^\w&]+/).filter(Boolean);
    score += wordHits(msg, titleTokens);

    // Extra boost for attendance wording on Safe Arrival
    if (
      item.intent === "attendance" &&
      /(absen|didn.?t\s*(come|arrive)|not\s*(come|arrive)|no\s*show|not\s*here|attendance|(call|contact|notify|inform)\s*(the\s*)?parent)/i.test(msg)
    ) {
      score += 8;
    }

    if (score > topScore) {
      topScore = score;
      best = item;
    }
  });

  // If we are VERY confident locally, answer from local summary
  if (best && topScore >= LOCAL_CONFIDENCE_THRESHOLD) {
    return renderAnswer(best);
  }

  // 2) Otherwise, use GPT via Cloudflare to choose the right policy & craft answer
  return await askGptPolicy(raw);
}
