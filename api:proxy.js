export async function onRequestPost(context) {
    try {
      const { request, env } = context;
      const body = await request.json();
  
      const OPENAI_KEY = env.OPENAI_API_KEY;  // stored secretly in repo settings
  
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a CMS School Policy Assistant. Answer ONLY based on provided policy text." },
            { role: "user", content: body.prompt }
          ],
          max_tokens: 400
        })
      });
  
      const data = await response.json();
  
      return new Response(JSON.stringify({ answer: data.choices[0].message.content }), {
        headers: { "Content-Type": "application/json" }
      });
  
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  