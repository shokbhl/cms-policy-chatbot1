export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response("", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Only handle chatbot API route
    if (url.pathname !== "/api/chatbot") {
      return new Response("Not found", { status: 404 });
    }

    try {
      const body = await request.json();
      const userQuestion = body.question;

      // Read KV values
      const rawPolicies = await env.cms_policies.get("policies", "json");
      const rawProtocols = await env.cms_protocols.get("protocols", "json");

      const allDocs = [...rawPolicies, ...rawProtocols];

      // Embed + match with OpenAI
      const systemPrompt = `
Match the user's question to the most relevant CMS policy or protocol.

Always include this:
- "answer": a short explanation from the policy
- "link": ALWAYS include the hyperlink from the JSON for that policy
`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: JSON.stringify({
                question: userQuestion,
                documents: allDocs,
              }),
            },
          ],
        }),
      });

      const ai = await response.json();

      return new Response(JSON.stringify(ai), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });

    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Worker crashed", details: err.message }),
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
          },
        }
      );
    }
  },
};