export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS for frontend
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // ---- ROUTE: GET ALL POLICIES ----
    if (url.pathname === "/api/all-policies") {
      const json = await env.POLICIES_KV.get("policies_json");
      return new Response(json, {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ---- ROUTE: GET ALL PROTOCOLS ----
    if (url.pathname === "/api/all-protocols") {
      const json = await env.POLICIES_KV.get("protocols_json");
      return new Response(json, {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ---- ROUTE: MAIN CHATBOT ----
    if (url.pathname === "/api/chatbot") {
      try {
        const { question } = await request.json();
        if (!question) {
          return new Response(JSON.stringify({ error: "Missing question" }), {
            status: 400,
            headers,
          });
        }

        // Load policies
        const raw = await env.POLICIES_KV.get("policies_json");
        const policies = JSON.parse(raw || "[]");

        // Use OpenAI
        const completion = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You match staff questions to CMS policies. Always return policyTitle, answer, and policyId.",
              },
              {
                role: "user",
                content: `Policies list: ${JSON.stringify(
                  policies
                )}\n\nStaff question: ${question}`,
              },
            ],
          }),
        });

        const result = await completion.json();

        let answer = result?.choices?.[0]?.message?.content || "No answer.";
        let policyIdMatch = answer.match(/policyId:\s*([a-zA-Z0-9_-]+)/);

        let matchedPolicy = null;
        if (policyIdMatch) {
          matchedPolicy = policies.find((p) => p.id === policyIdMatch[1]);
        }

        return new Response(
          JSON.stringify({
            answer,
            policyTitle: matchedPolicy?.title || null,
            policyLink: matchedPolicy?.link || null,
          }),
          { headers }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.toString() }), {
          status: 500,
          headers,
        });
      }
    }

    return new Response("CMS Worker Running", { headers });
  },
};