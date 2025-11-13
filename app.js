// ====== CONFIG ======
const STAFF_ACCESS_CODE = "cms-staff-2025";
const STORAGE_KEY_LOGGED_IN = "schoolPolicyChatbotLoggedIn";

// 🔁 Your actual Cloudflare API URL:
const GPT_API_URL = "https://9e0df439.cms-6j8.pages.dev/api/chatbot";


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
      "If a child is absent without notice, staff contact parents by 10:00 a.m. and escalate to emergency contacts if unreachable. Children are only released to parents or authorized individuals with photo ID. Late pickups escalate until 7:00 p.m., then CAS is contacted if needed.",
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
      "Serious occurrences include death, life-threatening injury, missing/unsupervised child, or major disruption. Address immediate safety, submit CCLS report within 24 hours, and post notification for 10 business days.",
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
      "Infants sleep on their backs in labelled cribs with no pillows or bumper pads. Staff perform direct visual checks every 15 minutes and record them on the sleep sheet.",
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
      "Toddlers and preschoolers use labelled cots. Staff stay in the room, perform visual checks at least every 30 minutes, and record them.",
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
      "New staff receive orientation; ongoing professional development is provided through meetings, workshops, and conferences. All staff maintain First Aid & CPR Level C.",
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
      "Students and volunteers never replace staff, never count in ratios, and are never left alone with children. They follow CMS policies and are supported by a mentoring teacher.",
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
      "There is no fee to join the waiting list. Priority goes to CMS transfers, siblings, and staff children. Offers follow first-come, first-served based on application date.",
    link: "https://docs.google.com/document/d/1anDQ7wth7Hm2L1H2eTp6bul1EiMo-dhh"
  }
];

// ====== ELEMENTS ======
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementByclassList?""  /* main code continues */ 
