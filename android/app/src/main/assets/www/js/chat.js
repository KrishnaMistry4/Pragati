// Pragati — nursing tutor chatbot (client side). Talks to the "chat" Supabase Edge Function,
// which is the only place the Gemini API key ever lives (server-side, never shipped here).
const Chat = (() => {
  let messages = []; // [{role:'user'|'assistant', content, created_at}]

  async function loadHistory(token) {
    const raw = await SB.rpc("fn_get_chat_history", { p_token: token, p_limit: 30 });
    messages = (raw || []).slice().reverse();
    return messages;
  }

  function getMessages() { return messages; }

  async function send(token, text) {
    messages.push({ role: "user", content: text, created_at: new Date().toISOString() });
    const res = await fetch(`${SB.URL}/functions/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SB.KEY, "Authorization": "Bearer " + SB.KEY },
      body: JSON.stringify({ token, message: text })
    });
    if (!res.ok) {
      const reply = "Sorry, something went wrong reaching the AI tutor. Try again in a moment.";
      messages.push({ role: "assistant", content: reply, created_at: new Date().toISOString() });
      return reply;
    }
    const data = await res.json();
    messages.push({ role: "assistant", content: data.reply, created_at: new Date().toISOString() });
    return data.reply;
  }

  function reset() { messages = []; }

  return { loadHistory, getMessages, send, reset };
})();
