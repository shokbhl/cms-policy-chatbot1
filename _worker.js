export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "POST, OPTIONS"
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const data = await request.json();
      const question = data.question;

      // Get both KV datasets
      const policiesJSON = await env.cms_policies.get("policies", "json");
      const protocolsJSON = await env.cms_protocols.get("protocols", "json");

      const all = [...(policiesJSON || []), ...(protocolsJSON || [])];

      // Prepare OpenAI request
      const openaiPayload = {
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: `
You are a CMS policy assistant. 
Match the best policy and return JSON:

{
  "id": "...",
  "title": "...",
  "answer": "...",
  "link": "..."
}
When useful, quote EXACT sections.
`},
          { role: "user", content: `
User question: "${question}"
Policies data: ${JSON.stringify(all)}
` }
        ]
      };

      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(openaiPayload),
      });

      const result = await completion.json();

      let content = "";
      try {
        content = JSON.parse(result.choices?.[0]?.message?.content || "{}");
      } catch (e) { 
        return new Response(JSON.stringify({ error: "AI JSON parse failed" }), { status: 500 });
      }

      // -----------------------------
      // 🔥 Hyperlink formatting
      // -----------------------------
      function hyperlink(text) {
        if (!text) return text;

        return text.replace(
          /(https?:\/\/[^\s]+)/g, 
          (url) => `<a href="${url}" target="_blank">${url}</a>`
        );
      }

      if (content.answer) content.answer = hyperlink(content.answer);
      if (content.link)   content.link = hyperlink(content.link);

      return new Response(JSON.stringify(content), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
};