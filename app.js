// Typing animation element
function showTyping() {
  const row = document.createElement("div");
  row.className = "msg-row bot typing-row";

  const bubble = document.createElement("div");
  bubble.className = "msg assistant";

  bubble.innerHTML = `
    <div class="typing">
      <div></div><div></div><div></div>
    </div>
  `;

  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return row;
}

// Ask policy
async function askPolicy(q) {
  if (!q.trim()) return;

  addUserMessage(q);

  const typingEl = showTyping();

  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q })
    });

    const data = await r.json();

    typingEl.remove();

    const answer =
      `<b>${data.policy?.title || "Policy"}</b><br><br>` +
      data.answer +
      (data.policy?.link
        ? `<br><br><a href="${data.policy.link}" target="_blank">Open full policy</a>`
        : "");

    addBotMessage(answer);

  } catch (e) {
    typingEl.remove();
    addBotMessage("Error: unable to connect.");
  }
}

// Handle submit
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  askPolicy(userInput.value);
  userInput.value = "";
});