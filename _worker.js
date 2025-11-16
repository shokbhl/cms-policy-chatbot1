// _worker.js
// CMS Policy Chatbot API v5 – Hybrid (GPT classification + embeddings + keywords)
// Always selects the best matching policy among the 17 CMS policies.

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o-mini";

// Will be filled at runtime
let POLICY_EMBEDDINGS = null; // [{ id, vector }]

// ========= MAIN EXPORT =========
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- CORS / preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // ============ API ROUTE ============
    if (url.pathname === "/api/chatbot") {
      if (request.method === "GET") {
        return new Response(
          "CMS Policy Chatbot API v5 (Hybrid GPT + embeddings + keywords) is online.",
          { status: 200, headers: corsHeaders({ "Content-Type": "text/plain" }) }
        );
      }

      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: corsHeaders({ Allow: "POST" })
        });
      }

      let body;
      try {
        body = await request.json();
      } catch (err) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const questionRaw = (body.question || body.message || "").trim();
      if (!questionRaw) {
        return jsonResponse(
          { error: "Missing 'question' in request body." },
          400
        );
      }

      const apiKey = env.OPENAI_API_KEY;
      const qLower = questionRaw.toLowerCase();

      // =========================
      // NO API KEY → keyword-only fallback
      // =========================
      if (!apiKey) {
        const best = keywordOnlyBestMatch(qLower);
        const policy = best || POLICY_KB[0]; // pick something
        return jsonResponse(
          {
            answer:
              policy.text +
              "\n\nThis answer is based on the CMS policy: \"" +
              policy.title +
              "\".",
            policyId: policy.id,
            policyTitle: policy.title,
            policyLink: policy.link,
            meta:
              "OpenAI API key not configured; keyword-only fallback used, forced best match.",
            confidence: best ? best.score : 0,
            error: "OPENAI_API_KEY missing"
          },
          200
        );
      }

      // =========================
      // FULL HYBRID AI PIPELINE
      // =========================
      try {
        // 0) Manual override for Safe Arrival (common wording)
        const safeArrivalPolicy = POLICY_KB.find((p) => p.id === "safe_arrival");
        if (matchesSafeArrivalOverride(qLower) && safeArrivalPolicy) {
          const answerText = await answerWithPolicyContext(
            apiKey,
            safeArrivalPolicy,
            questionRaw
          );
          return jsonResponse(
            {
              answer: answerText,
              policyId: safeArrivalPolicy.id,
              policyTitle: safeArrivalPolicy.title,
              policyLink: safeArrivalPolicy.link,
              meta: "Manual override → Safe Arrival & Dismissal",
              confidence: 0.99,
              error: null
            },
            200
          );
        }

        // 1) Ensure we have embeddings for all policies
        await ensurePolicyEmbeddings(apiKey);

        // 2) Embed the question
        const qEmbedding = await embedText(apiKey, questionRaw);

        // 3) Compute embedding similarities for all policies
        const similarities = computeAllSimilarities(qEmbedding);

        // 4) Keyword scores for all policies
        const keywordScores = POLICY_KB.map((p) =>
          keywordMatchScore(p, qLower)
        );

        // 5) GPT classification into one of the 17 policies
        const classification = await classifyPolicyWithGPT(apiKey, questionRaw);

        // 6) Combine scores & pick best policy (ALWAYS picks one)
        const bestPolicy = chooseBestPolicy(
          similarities,
          keywordScores,
          classification
        );

        // 7) Generate final answer using ONLY that policy text
        const finalAnswer = await answerWithPolicyContext(
          apiKey,
          bestPolicy,
          questionRaw
        );

        const bestSim =
          similarities[POLICY_KB.findIndex((p) => p.id === bestPolicy.id)] || 0;

        return jsonResponse(
          {
            answer: finalAnswer,
            policyId: bestPolicy.id,
            policyTitle: bestPolicy.title,
            policyLink: bestPolicy.link,
            meta:
              "Answer generated using CMS policy context with GPT-4o-mini, GPT policy classification, embeddings and keyword boosting. Always returns best matching policy.",
            confidence: bestSim,
            error: null
          },
          200
        );
      } catch (err) {
        console.error("Error in /api/chatbot:", err);
        // If anything fails, fallback to keyword best-match
        const best = keywordOnlyBestMatch(qLower);
        const policy = best || POLICY_KB[0];

        return jsonResponse(
          {
            answer:
              policy.text +
              "\n\nThis answer is based on the CMS policy: \"" +
              policy.title +
              "\".",
            policyId: policy.id,
            policyTitle: policy.title,
            policyLink: policy.link,
            meta:
              "Fallback due to error in AI pipeline; keyword-only best match used.",
            confidence: best ? best.score : 0,
            error: String(err)
          },
          200
        );
      }
    }

    // ============ FRONTEND ASSETS ============
    if (env.ASSETS) {
      return env.ASSETS.fetch(request, env, ctx);
    }

    return new Response("CMS Policy backend v5", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }
};

// ========= HELPERS =========

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    ...extra
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json" })
  });
}

// ====== SAFE ARRIVAL OVERRIDE ======

function matchesSafeArrivalOverride(qLower) {
  const patterns = [
    /absen/i,
    /didn.?t\s*(come|arrive)/i,
    /did not\s*(come|arrive)/i,
    /not\s*(come|arrive)/i,
    /no\s*show/i,
    /not\s*here/i,
    /missing\s+at\s+arrival/i,
    /(call|contact|notify)\s+(the\s*)?parent/i,
    /late\s*pickup/i,
    /late\s*pick\s*up/i,
    /arrival/i,
    /dismissal/i
  ];
  return patterns.some((re) => re.test(qLower));
}

// ====== EMBEDDINGS HELPERS ======

async function ensurePolicyEmbeddings(apiKey) {
  if (POLICY_EMBEDDINGS && POLICY_EMBEDDINGS.length === POLICY_KB.length) {
    return;
  }

  const input = POLICY_KB.map((p) => p.text);
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("Embeddings error:", res.status, txt);
    throw new Error("Failed to create policy embeddings");
  }

  const data = await res.json();
  POLICY_EMBEDDINGS = data.data.map((d, i) => ({
    id: POLICY_KB[i].id,
    vector: d.embedding
  }));
}

async function embedText(apiKey, text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("Embedding error:", res.status, txt);
    throw new Error("Failed to embed text");
  }

  const data = await res.json();
  return data.data[0].embedding;
}

function computeAllSimilarities(qVec) {
  if (!POLICY_EMBEDDINGS || POLICY_EMBEDDINGS.length === 0) {
    return new Array(POLICY_KB.length).fill(0);
  }

  const sims = [];
  for (let i = 0; i < POLICY_EMBEDDINGS.length; i++) {
    sims.push(cosineSimilarity(qVec, POLICY_EMBEDDINGS[i].vector));
  }
  return sims;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ====== KEYWORD MATCHING (with fuzzy-ish boost) ======

function keywordMatchScore(policy, qLower) {
  let score = 0;

  for (const kw of policy.keywords || []) {
    const kwLower = kw.toLowerCase();

    // Exact substring match → strong
    if (qLower.includes(kwLower)) {
      score += 2;
      continue;
    }

    // Loose match: check first 4 chars for typos (if long enough)
    if (kwLower.length >= 5) {
      const prefix = kwLower.slice(0, 4);
      if (qLower.includes(prefix)) {
        score += 1;
      }
    }
  }

  return score;
}

function keywordOnlyBestMatch(qLower) {
  let best = null;
  let bestScore = 0;

  for (const policy of POLICY_KB) {
    const score = keywordMatchScore(policy, qLower);
    if (score > bestScore) {
      bestScore = score;
      best = { policy, score };
    }
  }

  return best;
}

// ====== GPT POLICY CLASSIFICATION ======

async function classifyPolicyWithGPT(apiKey, questionRaw) {
  try {
    const policyList = POLICY_KB.map(
      (p) => `${p.id}: ${p.title}`
    ).join("\n");

    const systemPrompt = [
      "You are a classifier for the Central Montessori School (CMS) Policy Assistant.",
      "Your job is to choose EXACTLY ONE policy id from the list provided.",
      "You MUST respond in strict JSON with two fields: policyId (string) and confidence (number 0-1).",
      "policyId MUST be one of the ids listed. If you are not sure, choose the closest one.",
      "Do NOT include any extra fields or text."
    ].join(" ");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "system",
            content:
              "Valid CMS policy ids and titles:\n" + policyList
          },
          {
            role: "user",
            content:
              "Question from staff: " +
              questionRaw +
              "\n\nReturn JSON {\"policyId\": \"...\", \"confidence\": 0.xx}"
          }
        ]
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("GPT classification error:", res.status, txt);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse classification JSON:", content);
      return null;
    }

    if (!parsed.policyId) return null;

    return {
      policyId: parsed.policyId,
      confidence:
        typeof parsed.confidence === "number"
          ? parsed.confidence
          : 0.6
    };
  } catch (err) {
    console.error("Error in classifyPolicyWithGPT:", err);
    return null;
  }
}

// ====== BEST POLICY CHOICE (always picks something) ======

function chooseBestPolicy(similarities, keywordScores, classification) {
  let bestPolicy = POLICY_KB[0];
  let bestScore = -1;

  for (let i = 0; i < POLICY_KB.length; i++) {
    const policy = POLICY_KB[i];
    const sim = similarities[i] || 0;
    const kw = keywordScores[i] || 0;

    let combined = sim + kw * 0.15; // base: embeddings + keyword boost

    // If GPT classification picked this policy, give it a big boost
    if (classification && classification.policyId === policy.id) {
      const c = classification.confidence || 0.6;
      combined += 0.75 * c;
    }

    if (combined > bestScore) {
      bestScore = combined;
      bestPolicy = policy;
    }
  }

  return bestPolicy;
}

// ====== GPT ANSWER WITH POLICY CONTEXT ======

async function answerWithPolicyContext(apiKey, policy, questionRaw) {
  const systemPrompt = [
    "You are the Central Montessori School (CMS) Staff Policy Assistant.",
    "You must answer questions ONLY using the CMS policy text I provide.",
    "Do NOT invent policies or rules that are not in the text.",
    "If something is unclear or not covered, say staff should check the full written policy or ask the Principal/Head of School.",
    "Tone: professional, clear, concise, supportive.",
    "Use short bullet points for steps when appropriate.",
    "Keep answers focused on what staff should do."
  ].join(" ");

  const policyContext =
    "Policy Title: " +
    policy.title +
    "\n\nPolicy Text:\n" +
    policy.text +
    "\n\nYou are not allowed to add new rules beyond this text.";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.15,
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: policyContext },
        {
          role: "user",
          content:
            "Staff question: " +
            questionRaw +
            "\n\nAnswer using ONLY the CMS policy text above."
        }
      ]
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("OpenAI chat error:", res.status, txt);
    throw new Error("Failed to get answer from OpenAI");
  }

  const data = await res.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();
  return (
    answer ||
    "I’m unable to formulate a detailed answer right now. Please check the written policy or ask your Principal/Head of School."
  );
}

// ========= POLICY KNOWLEDGE BASE =========
// 👇 KEEP YOUR 17-POLICY ARRAY HERE. This is the SAME structure you already used.
// If you don’t have it anymore, tell me and I’ll resend it fully populated.

const POLICY_KB = [
  {
    id: "anaphylaxis",
    title: "Anaphylaxis & Severe Allergies",
    keywords: [
      "anaphylaxis",
      "allergy",
      "allergies",
      "epipen",
      "epi-pen",
      "epinephrine",
      "nut",
      "peanut",
      "tree nut",
      "reaction",
      "food allergy"
    ],
    text:
      "Anaphylaxis is a severe, potentially life-threatening allergic reaction. CMS takes a proactive approach to prevention: labels are checked every time food is purchased or served; foods labelled 'may contain' or 'traces of' nuts/tree nuts are not served; and children with allergies that cannot be safely accommodated may be asked to bring food from home. Individual plans are created with parents and physicians and posted where needed. In an emergency, staff follow the child’s Individual Plan: administer epinephrine (EpiPen) at the first sign of anaphylaxis, call 911, keep a calm staff with the child, document the time and dose given, and ensure the child is transported to hospital even if symptoms improve. The used EpiPen must accompany the child and be handed to hospital staff or the parent for disposal. Extra supervision is given during meals and on trips, and EpiPens travel with the child at all times.",
    link:
      "https://docs.google.com/document/d/1YWBYRtwwrunMv041-MAh-XBzW9HIRc_h"
  },
  {
    id: "vulnerable_sector",
    title: "Criminal Reference / Vulnerable Sector Check",
    keywords: [
      "vulnerable sector",
      "vsc",
      "criminal reference",
      "police check",
      "offence declaration",
      "attestation",
      "record check"
    ],
    text:
      "Employment or volunteer work at CMS is conditional on a clear Vulnerable Sector Check (VSC). A current VSC (issued within the past 6 months) must be on file before unsupervised contact with children. Staff awaiting VSC results may only have supervised contact and must sign an Offence Declaration. VSCs are renewed every 5 years and staff complete annual Offence Declarations in the years between. Any new criminal conviction must be reported to the supervisor as soon as reasonably possible. Volunteers and other persons providing services to children must also provide VSCs, Offence Declarations or employer attestations as required. All records are securely tracked and kept for the required period, and individuals with relevant convictions may not provide care for children.",
    link:
      "https://docs.google.com/document/d/1CSk2ip1_ZQVFgK0XbLNzanNHMD_XfTXD"
  },
  {
    id: "emergency_management",
    title: "Emergency Management (Lockdown, Evacuation, Disasters)",
    keywords: [
      "emergency",
      "lockdown",
      "hold and secure",
      "evacuation",
      "meeting place",
      "evacuation site",
      "earthquake",
      "tornado",
      "gas leak",
      "environmental threat",
      "bomb threat"
    ],
    text:
      "CMS follows a three-phase approach during emergencies: Immediate Emergency Response, Next Steps during the Emergency, and Recovery. Staff must keep children safe, accounted for and supervised at all times. Depending on the situation, staff may initiate lockdown or hold & secure, evacuate to the designated meeting place in front of the school, or move to the evacuation site at 157 Willowdale Ave if it is unsafe to return to the centre. Procedures are defined for situations such as lockdown, hold & secure, bomb threats, disasters requiring evacuation (e.g. fire, flood), external environmental threats (e.g. gas leak), tornadoes and major earthquakes. Staff grab attendance, emergency contact info, emergency medications and the emergency bag if possible, conduct frequent head counts, and follow all directions given by emergency services personnel. Serious occurrences are reported according to the Serious Occurrence Policy, and events are documented in the daily written record.",
    link:
      "https://docs.google.com/document/d/176nOfzH9oSBVWbd1NmJwquiGhK1Tvh9X"
  },
  {
    id: "fire_safety",
    title: "Fire Safety & Evacuation",
    keywords: [
      "fire",
      "fire drill",
      "evacuation",
      "emergency shelter",
      "fire safety",
      "alarm"
    ],
    text:
      "In the event of a fire or fire drill, each teacher has clearly defined responsibilities. The first teacher gathers the children and proceeds immediately to the nearest safe exit, doing a quick headcount. Another staff member brings the daily attendance and emergency box, and a third checks that windows and doors are closed, lights are off and no one remains behind. Once outside, staff take attendance again and keep children at a safe distance until instructions are received to either return to the building or proceed to the designated emergency shelter locations (such as the Maplehurst Early Years campus or the Willowdale campus, depending on the site). Supervisors ensure staff are trained in use of fire protection equipment, exits remain unobstructed, and regular checks of exits, lighting, combustible materials and storage of flammable items are completed.",
    link:
      "https://docs.google.com/document/d/1J0oYtK4F25qkOwhq0QmOkYIKy2EcCRGc"
  },
  {
    id: "medication",
    title: "Medication Administration",
    keywords: [
      "medication",
      "medicine",
      "drug",
      "prescription",
      "over the counter",
      "medication dispensing",
      "medication form"
    ],
    text:
      "CMS only administers prescribed or over-the-counter medication when it is accompanied by a doctor’s note and provided in its original, properly labelled container. A Medication Dispensing Form must be completed and signed by the parent and staff when medication is first brought in, and is reviewed daily as medication is given. Staff verify the child’s name, medication name, dosage, date of purchase, storage requirements, administration instructions and physician information against the label. Medications are stored in labelled, locked medication bags (refrigerated or non-refrigerated) with keys kept in the classroom. Only qualified staff (e.g., RECE or designated staff in charge) administer medication, document the dose and time, and notify parents if medication is late or missed. Leftover medication or discontinued medication is returned to parents, and all records are filed in the child’s main office file.",
    link:
      "https://docs.google.com/document/d/1wlfJ0bwOzgK2qZ-qvK0ghBeCQrFaNvMW"
  },
  {
    id: "behaviour_monitoring",
    title: "Monitoring Behaviour Management (Staff)",
    keywords: [
      "behaviour",
      "behavior",
      "discipline",
      "behaviour management",
      "observation",
      "prohibited practices",
      "guidance"
    ],
    text:
      "CMS requires that all staff, students and volunteers understand and follow the centre’s behaviour management philosophy and legislative requirements. Behaviour guidance practices are reviewed during hiring and orientation, and staff sign the policy at orientation and annually thereafter. Performance appraisals include a section on behaviour management to ensure age-appropriate, positive guidance practices are used. Staff are obligated to report any concerning incidents to the supervisor; if the supervisor is implicated, they must report directly to the operator/board. The supervisor performs daily and scheduled observations and completes an annual behaviour management monitor form to document supervision quality, positive guidance, respect for children, and compliance with prohibited practices. Records are retained for at least two years.",
    link:
      "https://docs.google.com/document/d/1OdcYClWJs3069UkL5JQ9Ne4gv2VYEybH"
  },
  {
    id: "parent_issues",
    title: "Parent Issues & Concerns",
    keywords: [
      "parent",
      "issue",
      "concern",
      "complaint",
      "feedback",
      "cas",
      "abuse",
      "neglect"
    ],
    text:
      "CMS encourages open, ongoing communication with families and takes all issues and concerns seriously. Parents may raise concerns verbally or in writing, and an initial response is provided within 1–2 business days. All issues are documented with date, time, who received the concern, who reported it, details, and steps taken or next-step information. Investigations are conducted fairly and respectfully while maintaining confidentiality, except where information must be shared with authorities (e.g. Ministry of Education, law enforcement, CAS). Harassment or discrimination from any party is not tolerated, and staff may end a conversation if they feel threatened or belittled. Concerns about suspected child abuse or neglect must be reported directly to the Children’s Aid Society by the person who has reasonable grounds to suspect it (duty to report).",
    link:
      "https://docs.google.com/document/d/1pHAxv4AAjTsho6S9uvxmcI5dIUxsfF_2"
  },
  {
    id: "playground",
    title: "Playground Safety",
    keywords: [
      "playground",
      "outdoor",
      "equipment",
      "inspection",
      "ratios",
      "gross motor",
      "supervision outdoors"
    ],
    text:
      "CMS outdoor play areas are maintained to meet CSA standards for children’s play spaces and equipment. Designated staff conduct and record daily visual inspections to check for debris, damage, vandalism and hazards such as ropes or strings. Monthly detailed inspections are done by the Principal/Supervisor/Admin to assess wear, damage and the condition of fences and structures. Annual comprehensive inspections are completed internally and by a certified third-party Playground Safety Inspector. Defects are recorded in a repair log and unsafe areas are blocked off until repaired. Staff must always maintain required ratios outdoors, bring emergency bags (including first aid, allergy list and medications), conduct head counts at transitions, check clothing for entanglement hazards and position themselves throughout the playground to ensure constant supervision while facilitating safe, engaging play.",
    link:
      "https://docs.google.com/document/d/17T9aic0O_3DeBNx2jXlPCbqZqbkVhoLA"
  },
  {
    id: "program_statement",
    title: "Program Statement Implementation & Prohibited Practices",
    keywords: [
      "program statement",
      "prohibited practices",
      "guidance",
      "discipline",
      "positive guidance",
      "corporal punishment"
    ],
    text:
      "The CMS Program Statement Implementation Policy outlines how staff, students and volunteers put the program philosophy into practice while complying with the Child Care and Early Years Act. CMS strictly prohibits corporal punishment; physical restraint except as a last resort to prevent imminent harm; locking exits or confining a child without supervision (except when required in emergencies); harsh or degrading measures, threats or language; depriving basic needs such as food, drink, toileting or sleep; and inflicting bodily harm, including forcing children to eat or drink. Staff are expected to use positive, age-appropriate guidance, redirect behaviour, and involve the Supervisor/Principal/Head of School when behaviour endangers safety or persists despite interventions. Violations trigger a graduated discipline process, from verbal warning and training plans for minor contraventions to suspension or dismissal for major contraventions; corporal punishment and serious bodily harm may result in immediate suspension or dismissal.",
    link:
      "https://docs.google.com/document/d/1uopwojEYO5vUUeXLSOYa9kseGQ9Sxpy7"
  },
  {
    id: "public_health",
    title: "Public Health, Illness & Infection Control",
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
      "cleaning",
      "disinfection",
      "diapering",
      "hand hygiene"
    ],
    text:
      "CMS follows Toronto Public Health guidelines for infection prevention and control. Staff assess children’s wellness, considering the risk of spreading illness and the child’s ability to participate. Children may be sent home for symptoms such as fever (e.g. 38°C or higher), vomiting, diarrhea, undiagnosed rash, persistent pain, communicable disease, head lice or severe cough. Ill children are separated from the group until pick-up, and Illness Forms are completed and signed by parents. Cleaning and disinfection routines include regular cleaning of toys, high-touch surfaces, floors and washrooms with approved disinfectants such as Oxivir, following manufacturer contact times. Strict hand hygiene, glove use, proper diapering and toileting practices, and safe handling of blood and bodily fluids are required. During outbreaks, CMS enhances cleaning, isolates ill individuals, notifies Public Health, maintains line lists of cases and follows all Public Health directions for control and communication.",
    link:
      "https://docs.google.com/document/d/1T_JBLAb6DhIZpCy1jrTx10f18SFRzO8V"
  },
  {
    id: "safe_arrival",
    title: "Safe Arrival & Dismissal",
    keywords: [
      "arrival",
      "dismissal",
      "pick up",
      "pickup",
      "drop off",
      "safe arrival",
      "safe dismissal",
      "absent",
      "no show",
      "late pickup",
      "photo id",
      "authorize",
      "attendance"
    ],
    text:
      "The Safe Arrival and Dismissal Policy ensures children are only released to their parent/guardian or an individual the parent/guardian has authorized in writing. At drop-off, staff greet the family, confirm any alternative pick-up arrangements, document changes in the daily record and sign the child into attendance. If a child is absent without prior notice, staff start contacting the parent/guardian by 10:00 a.m., leave messages if needed, and escalate to emergency contacts if no response is received within the specified timeframe. At pick-up, staff release children only to known parents/guardians or authorized individuals; if the person is unknown to staff, photo ID is checked and compared to the child’s file and a copy may be kept. For late pick-ups, staff attempt to contact parents, then emergency contacts; if no one can be reached by 7:00 p.m., staff must contact the local Children’s Aid Society and follow their directions. Children are never dismissed to walk home alone or without supervision.",
    link:
      "https://docs.google.com/document/d/1IpN3To4GJnHFc-EMaT4qkBBTfY6Cvz_h"
  },
  {
    id: "serious_occurrence",
    title: "Serious Occurrence",
    keywords: [
      "serious occurrence",
      "so report",
      "death",
      "life threatening",
      "missing child",
      "unsupervised child",
      "disruption",
      "ccls"
    ],
    text:
      "A serious occurrence includes: the death of a child who received care; abuse, neglect or allegations of abuse/neglect while in care; life-threatening injury or illness; a missing or temporarily unsupervised child; or an unplanned disruption of normal operations that poses a risk to children’s health, safety or well-being. Staff must first address immediate safety (e.g. 911, first aid), then notify appropriate authorities such as Children’s Aid Society, police, Toronto Public Health or other agencies depending on the incident type. A Serious Occurrence Report must be submitted on the Child Care Licensing System (CCLS) within 24 hours, and a Serious Occurrence Notification Form must be posted for families for at least 10 business days while maintaining privacy (no names, ages or identifiers). The supervisor conducts an inquiry, documents details (what happened, when, who was involved, actions taken, current status and follow-up) and ensures mandatory employer reporting obligations to the College of Early Childhood Educators are met when applicable.",
    link:
      "https://docs.google.com/document/d/1QYqQgAvqKZiOjr3-3znh39nJQvTMyE9U"
  },
  {
    id: "sleep_infants",
    title: "Sleep Supervision – Infants",
    keywords: [
      "sleep",
      "crib",
      "infant",
      "safe sleep",
      "sids",
      "sleep supervision infant",
      "sleep policy infant"
    ],
    text:
      "For children under 12 months, CMS follows the Joint Statement on Safe Sleep: infants are placed on their backs to sleep unless a physician provides written instructions otherwise. Each infant has an individual crib that meets safety standards and is labeled with their name and a picture card. Cribs are inspected annually and documented. Sleepwear should be comfortable one-piece clothing to avoid overheating; cribs must be free of pillows, duvets, bumper pads and excess items. Staff perform direct visual checks every 15 minutes by being physically present beside the infant and checking breathing, colour and signs of distress, recording these on a sleep tracking sheet. There must be sufficient light in the sleep room to conduct checks, and when more than three infants are in the sleep room, one staff member must remain physically present. Strollers, swings and car seats are not considered safe sleep spaces; sleeping infants in these must be transferred to a crib as soon as possible.",
    link:
      "https://docs.google.com/document/d/1HoWGu9GNCalQ4QzIVwtIopinMJC79lNX"
  },
  {
    id: "sleep_toddlers",
    title: "Sleep Supervision – Toddlers & Preschoolers",
    keywords: [
      "sleep",
      "nap",
      "cot",
      "toddler",
      "preschool",
      "rest time",
      "sleep supervision toddler"
    ],
    text:
      "For toddlers and preschoolers, each child is assigned an individual cot labeled with their name and class. Parents are consulted about sleep arrangements at enrollment and whenever changes are needed. Staff ensure there is enough light to safely observe children and perform direct visual checks at least every 30 minutes by being physically present in the room, watching for changes in breathing, colour or signs of distress, and recording these checks on each child’s sleep tracking sheet. Significant changes in sleep patterns or behaviours are communicated to parents and may lead to changes in supervision or check frequency. Staff keep clear records of which children are in the sleep room and log their return to the classroom to ensure accurate attendance and supervision at all times.",
    link:
      "https://docs.google.com/document/d/1xXe0P_JThb3mRVwP4rtpNT4Gw3vCerec"
  },
  {
    id: "staff_development",
    title: "Staff Development & Training",
    keywords: [
      "staff development",
      "training",
      "professional development",
      "orientation",
      "first aid",
      "cpr"
    ],
    text:
      "CMS is committed to ongoing professional development to support high-quality child care. New staff, students and volunteers receive a formal orientation that covers CMS policies and procedures, Public Health, Fire Safety and Ministry requirements. Supervisors and principals meet regularly with staff to identify areas for growth and arrange in-house or external training, workshops, conferences or self-directed learning. Staff must attend regular staff meetings where policies are reviewed, professional experiences shared and program decisions made. All staff are required to maintain Standard First Aid with Level C CPR (infant, child and adult); CMS provides an annual refresher and covers part of the cost. Professional development is viewed as a shared responsibility between administration and staff.",
    link:
      "https://docs.google.com/document/d/1VqwU1Gyd8qL0qiMzFMFQZpBUfIr1IVK_"
  },
  {
    id: "students_volunteers",
    title: "Supervision of Students & Volunteers",
    keywords: [
      "student",
      "volunteer",
      "placement",
      "supervision of students",
      "supervision of volunteers",
      "field placement"
    ],
    text:
      "Students and volunteers at CMS support the program but never replace qualified staff or count in child–staff ratios. They must be 18 or older, obtain a Vulnerable Sector Check, review and sign Prohibited Practices, Anaphylaxis and other key CMS policies, and receive existing Individual Support Plans before starting. They must wear identification, use professional language and titles with staff and parents, maintain confidentiality and avoid private arrangements or social contact with families unless approved by the Principal/Head of School. Students/volunteers must never be left alone with children and must always be within sight of a supervising staff member. A mentoring teacher, assigned by the supervisor/principal, clearly explains expectations, ensures students are supported and respected, and confirms that supervision and ratios are maintained at all times.",
    link:
      "https://docs.google.com/document/d/1b2FL-LEuF1y_tx72W0RQTDklT1Kkeen3"
  },
  {
    id: "waiting_list",
    title: "Waiting List",
    keywords: [
      "waiting list",
      "waitlist",
      "registration fee",
      "priority",
      "admission",
      "position on list"
    ],
    text:
      "CMS does not charge a fee to place a child on the waiting list. Priority admission is given to transfers from other CMS locations, siblings of current students and children of CMS employees. To be placed on the waiting list, families must complete and sign an admission form on the day they are added. The list is confidential: parents may ask about their child’s position, and staff will provide this information while concealing other families’ details. When a space becomes available, offers are made on a first-come, first-served basis according to the date of application. Once a placement is confirmed, a non-refundable, one-time registration fee (for example, $500) is payable. The waiting list policy is reviewed with staff, students and volunteers at hiring and annually thereafter.",
    link:
      "https://docs.google.com/document/d/1anDQ7wth7Hm2L1H2eTp6bul1EiMo-dhh"
  }
];