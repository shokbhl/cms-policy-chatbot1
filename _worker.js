// CMS Policy Chatbot Worker – Upgraded Precision & Detail (17 policies)

// NOTE: Comments are English-only as requested.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ----- CORS preflight -----
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // ----- Health check -----
    if (request.method === "GET" && url.pathname === "/api/chatbot") {
      return jsonResponse(
        { status: "ok", message: "CMS Policy Chatbot API is running." },
        200
      );
    }

    // ----- Main chatbot endpoint -----
    if (request.method === "POST" && url.pathname === "/api/chatbot") {
      try {
        const body = await request.json();
        const question = (body.question || "").trim();

        if (!question) {
          return jsonResponse(
            {
              error: "Empty question",
              answer: "Please enter a question so I can match it to a CMS policy."
            },
            400
          );
        }

        // 17 CMS policies – titles, short summaries, key points & links
        const policies = getPolicies();

        // ====== SYSTEM PROMPT (UPGRADED) ======
        const systemPrompt = `
You are the official CMS (Central Montessori School) Policy Assistant.

You receive:
- A user question from a staff member
- A list of 17 CMS policies, each with: id, title, short_summary, key_points, link

Your goals:
1. Carefully read the staff question and the policy list.
2. Decide which ONE policy best matches the question.
3. If none of the policies clearly apply, say you are not fully sure and do NOT fabricate a policy.
4. Give a detailed, professional answer in ENGLISH ONLY (about 3–7 sentences) that:
   - Is accurate and consistent with the provided policy information
   - Uses simple, clear language suitable for staff
   - Focuses on what the staff member should do in practice (step-by-step if helpful)
   - If relevant, includes concrete details from key_points such as:
     • specific times (e.g. 10:00 a.m., 7:00 p.m.)
     • deadlines (e.g. within 24 hours, for 10 business days)
     • ratios or ages (e.g. 1:3, toddlers, infants)
     • frequencies (e.g. every 15 minutes, monthly)
   - NEVER invents numbers, times, dates, phone numbers, or ratios that are not present in:
     • short_summary
     • key_points
   - If the question clearly needs an exact number that you do NOT see in the provided data, say:
     "Please check the full written policy (link below) for the exact time/number."

Output format:
Return ONLY JSON with EXACTLY this shape:

{
  "answer": "short but detailed professional answer here",
  "policyId": "id-from-list-or-null-if-none",
  "policyTitle": "exact policy title or null",
  "policyLink": "link or null",
  "confidence": 0.0
}

Additional rules:
- If you are at least ~70% sure which policy applies, choose it and give a clear, detailed answer.
- If you are less sure, set policyId, policyTitle, policyLink to null, and explain that you are not fully sure which policy applies.
- DO NOT invent or describe new policies beyond the 17 provided.
- The answer MUST stand alone (not just "see policy"), but you may say things like:
  "According to the Safe Arrival and Dismissal Policy..." or
  "Under the Serious Occurrence Policy..."
- Always include a reasonable confidence value between 0 and 1.
- Sometimes staff will ask in other languages (e.g., Farsi). ALWAYS answer in English only.
`.trim();

        const userPayload = {
          question,
          policies
        };

        const userPrompt =
          "Here is the staff question and the 17 CMS policies:\n\n" +
          JSON.stringify(userPayload, null, 2) +
          "\n\nRemember: respond ONLY with JSON in the required shape.";

        // ====== CALL OPENAI ======
        const openaiRes = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              // You can switch to "gpt-4.1" if your account supports it
              model: "gpt-4.1-mini",
              temperature: 0.15,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ]
            })
          }
        );

        if (!openaiRes.ok) {
          const errText = await openaiRes.text().catch(() => "");
          return jsonResponse(
            {
              error: "OpenAI API error",
              detail: errText.slice(0, 500),
              answer:
                "There was a problem contacting the CMS policy assistant. Please try again or check with the Principal/Head of School."
            },
            502
          );
        }

        const openaiData = await openaiRes.json();
        const rawContent = openaiData?.choices?.[0]?.message?.content || "{}";

        let parsed;
        try {
          parsed = JSON.parse(rawContent);
        } catch (e) {
          parsed = {
            answer:
              "I had trouble interpreting the policy response. Please check the written policies or ask the Principal/Head of School.",
            policyId: null,
            policyTitle: null,
            policyLink: null,
            confidence: 0
          };
        }

        // Ensure fields always exist and have safe types
        const answer =
          typeof parsed.answer === "string" && parsed.answer.trim()
            ? parsed.answer.trim()
            : "I could not confidently match this question to a CMS policy.";
        const policyId =
          parsed.policyId && typeof parsed.policyId === "string"
            ? parsed.policyId
            : null;
        const policyTitle =
          parsed.policyTitle && typeof parsed.policyTitle === "string"
            ? parsed.policyTitle
            : null;
        const policyLink =
          parsed.policyLink && typeof parsed.policyLink === "string"
            ? parsed.policyLink
            : null;
        const confidence =
          typeof parsed.confidence === "number" &&
          parsed.confidence >= 0 &&
          parsed.confidence <= 1
            ? parsed.confidence
            : 0;

        return jsonResponse(
          {
            answer,
            policyId,
            policyTitle,
            policyLink,
            confidence
          },
          200
        );
      } catch (err) {
        return jsonResponse(
          {
            error: "Worker error",
            detail: String(err),
            answer:
              "There was a technical problem answering this question. Please try again or check the CMS policy binder."
          },
          500
        );
      }
    }

    // ----- Fallback -----
    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders()
    });
  }
};

/* ========== HELPERS ========== */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

/**
 * 17 CMS policies – ID, title, short summary, key points, link
 * (Using your titles + links, plus numeric details where you shared them)
 */
function getPolicies() {
  return [
    {
      id: "anaphylaxis",
      title: "Anaphylaxis & Severe Allergies",
      short_summary:
        "Prevention and response for life-threatening allergic reactions, including EpiPen use, emergency steps, allergy posting and individual plans.",
      key_points: [
        "Focus on children with diagnosed anaphylaxis and severe food/environmental allergies.",
        "Requires individual plans and emergency procedures for each anaphylactic child.",
        "Allergy lists must be clearly posted in classrooms and food preparation areas.",
        "Epinephrine (EpiPen) must be accessible and staff trained in its use.",
        "In an emergency, administer EpiPen immediately and then call 911."
      ],
      link:
        "https://docs.google.com/document/d/1YWBYRtwwrunMv041-MAh-XBzW9HIRc_h"
    },
    {
      id: "vulnerable_sector",
      title: "Criminal Reference / Vulnerable Sector Check",
      short_summary:
        "Requirements for Vulnerable Sector Checks, offence declarations and attestations for staff, students and volunteers before they work with children.",
      key_points: [
        "All staff, students and volunteers must provide a Vulnerable Sector Check before beginning work with children.",
        "Offence declarations and attestations must be kept up to date as required by regulation.",
        "No one may be left alone with children until screening requirements are satisfied."
      ],
      link:
        "https://docs.google.com/document/d/1CSk2ip1_ZQVFgK0XbLNzanNHMD_XfTXD"
    },
    {
      id: "emergency_management",
      title: "Emergency Management Policy and Procedures",
      short_summary:
        "Three-phase approach (before, during, after) for emergencies such as fire, gas leak, lockdown, flood, severe weather, or other threats, including staff roles and communication.",
      key_points: [
        "Describes responses for events such as fire, flood, gas leak, carbon monoxide, lockdown, and relocation.",
        "Requires a three-phase approach: prepare, respond, recover.",
        "Includes communication with parents, emergency services (911), Public Health and the Ministry as required."
      ],
      link:
        "https://docs.google.com/document/d/176nOfzH9oSBVWbd1NmJwquiGhK1Tvh9X"
    },
    {
      id: "fire_safety",
      title: "Fire Safety Evacuation Procedures",
      short_summary:
        "Steps staff must follow during fire alarms and drills, including exits, attendance, emergency boxes, and emergency shelters.",
      key_points: [
        "First teacher gathers all children, proceeds to nearest exit and does a quick headcount.",
        "Second teacher brings the daily attendance sheet and emergency box.",
        "Assistant checks that windows and doors are closed, lights off, and nobody left behind.",
        "Once outside, staff take attendance and wait for instructions to return or go to the Emergency Shelter.",
        "Emergency shelter locations include Maplehurst Early Years (180 Sheppard Ave. E.) and Willowdale Campus (157 Willowdale Ave.).",
        "Daily: check all exit doors are unlocked and unobstructed before children arrive.",
        "Monthly: conduct fire drills and test fire alarm and smoke alarms.",
        "Written records of all fire drills and tests must be kept for at least 2 years."
      ],
      link:
        "https://docs.google.com/document/d/1J0oYtK4F25qkOwhq0QmOkYIKy2EcCRGc"
    },
    {
      id: "medication",
      title: "Medication Administration Policies and Procedures",
      short_summary:
        "Conditions and documentation for administering medication (prescription and over-the-counter), safe storage, labelling, and communication with parents.",
      key_points: [
        "CMS only administers prescribed drugs or over-the-counter medication accompanied by a doctor's note.",
        "Medication must be in the original container with pharmacy label, child’s name, drug name, dosage, date of purchase, storage & administration instructions, and physician’s name/phone.",
        "A Medication Dispensing Form must be completed, signed by the parent and staff, and posted on the class notice board and recorded in the logbook.",
        "Medication is stored locked in designated bags (refrigerated and non-refrigerated), with keys hung inside the classroom.",
        "Only RECE, qualified, or designated staff in charge may administer medication.",
        "Staff document dosage and actual time given; if late, record the actual time and notify the parent.",
        "Leftover medication at the end of the course is returned to the parent; completed forms are filed in the child’s main office file."
      ],
      link:
        "https://docs.google.com/document/d/1wlfJ0bwOzgK2qZ-qvK0ghBeCQrFaNvMW"
    },
    {
      id: "behaviour_monitoring",
      title: "Monitoring Behaviour Management – Staff",
      short_summary:
        "How CMS monitors staff behaviour guidance practices and ensures prohibited practices are not used.",
      key_points: [
        "Behaviour management policy is reviewed at hiring/orientation and annually.",
        "Staff performance appraisals include behaviour management/child guidance.",
        "Staff, students and volunteers must report incidents to the supervisor; records are kept on file.",
        "Supervisor observes behaviour management practices daily and through scheduled observations at least once per school year.",
        "Monitoring records are kept for at least 2 years."
      ],
      link:
        "https://docs.google.com/document/d/1OdcYClWJs3069UkL5JQ9Ne4gv2VYEybH"
    },
    {
      id: "parent_issues",
      title: "Parent Issues and Concerns Policy and Procedures",
      short_summary:
        "Process for receiving, documenting and responding to parent concerns or complaints, including duty to report suspected child abuse or neglect.",
      key_points: [
        "Issues/concerns may be raised verbally or in writing.",
        "Initial response to an issue or concern must be provided within 1–2 business days.",
        "All concerns must be documented: date/time received, who received it, who raised it, details, and steps taken.",
        "Investigations must be fair, impartial and respectful and initiated within 1–2 business days where possible.",
        "Everyone has a legal duty to report suspected child abuse or neglect directly to Children’s Aid Society (CAS).",
        "Parents may also contact the Ministry of Education or other regulators where appropriate."
      ],
      link:
        "https://docs.google.com/document/d/1pHAxv4AAjTsho6S9uvxmcI5dIUxsfF_2"
    },
    {
      id: "playground",
      title: "Playground Safety Policy",
      short_summary:
        "Safety standards for outdoor play areas, including inspections, maintenance, and staff supervision ratios.",
      key_points: [
        "Daily visual inspections are done by designated staff to check for hazards, debris, vandalism damage and unsafe items (e.g. strings, ropes).",
        "Monthly detailed inspections are performed and recorded by Principal/Supervisor/Admin.",
        "Annual comprehensive inspections are completed by Principal/Supervisor/Admin plus a certified third-party Playground Safety Inspector.",
        "Playground supervision ratios: infants 1:3, toddlers 1:5, preschoolers 1:8.",
        "Staff must bring emergency bags (first aid, allergy list, medications) outdoors and perform head counts at each transition."
      ],
      link:
        "https://docs.google.com/document/d/17T9aic0O_3DeBNx2jXlPCbqZqbkVhoLA"
    },
    {
      id: "program_statement",
      title: "Program Statement Implementation Policy",
      short_summary:
        "How CMS implements its program statement, ensures prohibited practices are not used, and supports positive, age-appropriate child guidance.",
      key_points: [
        "Prohibited practices include corporal punishment, harsh language, locking exits to confine children, and depriving basic needs.",
        "Staff must use positive guidance, redirection and help children correct their own behaviour when appropriate.",
        "Parents must be informed of concerning behaviour; major issues may lead to extra staffing, specialist consultation, or withdrawal.",
        "Minor contraventions lead to: first verbal warning, second disciplinary letter, third: written training plan with reviews and possible dismissal.",
        "Major contraventions related to prohibited practices can lead to suspension or immediate dismissal.",
        "All CMS facilities and equipment must be kept clean; handwashing and sanitary practices are required for staff and children."
      ],
      link:
        "https://docs.google.com/document/d/1uopwojEYO5vUUeXLSOYa9kseGQ9Sxpy7"
    },
    {
      id: "public_health",
      title: "Public Health Guidelines & Required CMS Policies",
      short_summary:
        "Health and safety, sanitary practices, infection prevention and control, illness exclusion, outbreak management and immunization requirements.",
      key_points: [
        "Staff must complete an Illness Form if a child’s health changes during the day and may require the child to be picked up.",
        "Ill children must be separated in a designated isolation area and supervised until pickup.",
        "Children must be symptom-free for 24 hours (fever) or 48 hours (vomiting/diarrhea) before returning, or have a doctor’s note.",
        "Toys are cleaned weekly or more often; during outbreaks, toys and materials must be cleaned and disinfected daily.",
        "Diaper changing and toileting must follow strict hand hygiene and glove use procedures.",
        "Outbreaks are reported to Toronto Public Health’s Communicable Diseases Surveillance Unit (CDSU) and require daily line lists.",
        "Immunization records must be kept up to date or official exemption forms must be on file."
      ],
      link:
        "https://docs.google.com/document/d/1T_JBLAb6DhIZpCy1jrTx10f18SFRzO8V"
    },
    {
      id: "safe_arrival",
      title: "Safe Arrival and Dismissal Policy and Procedures",
      short_summary:
        "Ensures children are only released to authorized adults, and describes what to do if a child does not arrive or is not picked up as expected.",
      key_points: [
        "Children are released only to parents/guardians or written authorized individuals; ID must be checked if staff do not know the person.",
        "Staff begin contacting parents if a child has not arrived and no message was received; calls must start by 10:00 a.m.",
        "If there is no response within about 4 hours, the supervisor/designee contacts emergency persons on file.",
        "If a child is not picked up by closing (6:00 p.m.), staff continue calling parents/emergency contacts.",
        "If no one can be reached and the child is still in care by 7:00 p.m., staff must contact Children’s Aid Society (CAS) at 416-924-4646 and follow CAS direction.",
        "Children are never dismissed to walk home alone; they are only dismissed into the care of an adult."
      ],
      link:
        "https://docs.google.com/document/d/1IpN3To4GJnHFc-EMaT4qkBBTfY6Cvz_h"
    },
    {
      id: "serious_occurrence",
      title: "Serious Occurrence Policy",
      short_summary:
        "Defines serious occurrences, reporting obligations, timelines and posting requirements, plus internal inquiry steps.",
      key_points: [
        "Serious occurrences include death, abuse or alleged abuse, life-threatening injury/illness, missing/unsupervised child, and unplanned disruptions that risk health and safety.",
        "Serious occurrences must be reported online in CCLS within 24 hours.",
        "A Serious Occurrence Notification Form must be posted for at least 10 business days near the licence and summary chart.",
        "The form must protect privacy: no names, initials, ages, or room identifiers.",
        "An annual analysis of serious occurrences is required, and records must be kept for 3 years.",
        "For allegations of abuse/neglect, CAS must be contacted; employer must also meet mandatory reporting obligations to the College of ECE where applicable."
      ],
      link:
        "https://docs.google.com/document/d/1QYqQgAvqKZiOjr3-3znh39nJQvTMyE9U"
    },
    {
      id: "sleep_infants",
      title: "The Sleep Supervision Policy and Procedures (Infants)",
      short_summary:
        "Safe sleep requirements for infants, including back-to-sleep positioning, crib standards, 15-minute checks and documentation.",
      key_points: [
        "Infants up to 12 months are placed on their backs to sleep, unless a physician provides written instructions otherwise.",
        "Each infant has an individual crib labelled with their name and picture card.",
        "Cribs must meet Canada Consumer Product Safety Act standards and be checked annually; records are kept for 3 years.",
        "Staff perform direct visual checks every 15 minutes by being physically beside the child and looking for signs of distress, breathing issues or overheating.",
        "Sleep checks are documented on a sleep tracking sheet for each child.",
        "No pillows, duvets or bumper pads in cribs; sleepwear should be appropriate to room temperature.",
        "If more than 3 infants are in the sleep room, at least one staff member must be physically present in that room."
      ],
      link:
        "https://docs.google.com/document/d/1HoWGu9GNCalQ4QzIVwtIopinMJC79lNX"
    },
    {
      id: "sleep_toddlers",
      title: "The Sleep Supervision Policy and Procedures (Toddler & Preschool)",
      short_summary:
        "Sleep arrangements and supervision for toddlers and preschoolers, including cot use, 30-minute checks and record-keeping.",
      key_points: [
        "Each child has an individual cot labelled with the child’s name and class.",
        "Parents are consulted at enrolment about sleep preferences and any needed accommodations.",
        "There must be enough light to conduct direct visual checks.",
        "Staff perform direct visual checks every 30 minutes while children are sleeping, looking for signs of distress or overheating.",
        "Sleep checks are documented on each child’s sleep tracking sheet.",
        "Children using the sleep room must be logged in/out of the room in the daily log to ensure they are always accounted for."
      ],
      link:
        "https://docs.google.com/document/d/1xXe0P_JThb3mRVwP4rtpNT4Gw3vCerec"
    },
    {
      id: "staff_development",
      title: "Staff Development and Training Policy",
      short_summary:
        "Orientation and ongoing professional development for CMS staff, including first aid/CPR training and regular meetings.",
      key_points: [
        "New staff, students and volunteers receive formal orientation covering CMS policies, Public Health, Fire Safety and Ministry requirements.",
        "Supervisors/principals meet with classroom staff monthly to discuss areas needing development or training.",
        "All staff are eligible for mandatory and optional training and workshops offered through the school.",
        "Only one staff per classroom attends training during program hours unless the Head of School approves otherwise.",
        "All staff must complete and maintain Standard First Aid with Level C CPR (infant, child, adult); a refresher course is provided each school year and CMS covers part of the cost."
      ],
      link:
        "https://docs.google.com/document/d/1VqwU1Gyd8qL0qiMzFMFQZpBUfIr1IVK_"
    },
    {
      id: "students_volunteers",
      title: "Supervision of Students & Volunteers Policy",
      short_summary:
        "Expectations and supervision requirements for students and volunteers; they must never replace staff or be left alone with children.",
      key_points: [
        "Students and volunteers must be 18 years or older.",
        "They are never counted in ratio and are never left alone with children.",
        "They must obtain a Vulnerable Sector Check and review CMS policies, prohibited practices, anaphylaxis policy and Individual Support Plans before starting.",
        "They must wear identification, use professional forms of address (Mr., Mrs., Miss), and refer parents to classroom teachers for questions.",
        "They may not photograph or video children without written consent from the Head of School/Principal/Supervisor.",
        "Mentoring teachers must keep students/volunteers in sight and cannot delegate full responsibility for children to them.",
        "Students/volunteers sign an acknowledgement that they understand and will follow these guidelines."
      ],
      link:
        "https://docs.google.com/document/d/1b2FL-LEuF1y_tx72W0RQTDklT1Kkeen3"
    },
    {
      id: "waiting_list",
      title: "Waiting List Policy & Procedures",
      short_summary:
        "How the waiting list is managed, including priorities, privacy, and the registration fee once a placement is offered.",
      key_points: [
        "CMS does not charge any fee to place a child on the waiting list.",
        "Priority is given to transfers from other CMS locations, siblings of current students, and children of CMS employees.",
        "Families must submit a completed admission form to be placed on the waiting list.",
        "Waiting list information is kept private; parents can ask about their child’s position but other names are physically concealed.",
        "Placement from the waiting list is on a first-come, first-served basis according to the date the child was added.",
        "Once a placement is offered and accepted, a non-refundable one-time registration fee of $500 is payable.",
        "Policy review records are kept for at least 3 years."
      ],
      link:
        "https://docs.google.com/document/d/1anDQ7wth7Hm2L1H2eTp6bul1EiMo-dhh"
    }
  ];
}