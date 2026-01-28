/**
 * AION ORCHESTRATOR v7.0 - UNIFIED API ENGINE
 * Rute: /api/login și /api/chat
 * Input: Universal (message, userMessage, prompt)
 * Output: Universal (response, reply, answer)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, ""); // Elimină slash final

    // 1. CORS UNIVERSAL (Pentru a permite accesul din orice frontend)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ==========================
      // ZONA 1: LOGIN (/api/login)
      // ==========================
      if (path === "/api/login" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const password = body.password || body.pass || "";

        // BACKDOOR: Parola 'start' trece mereu (pentru urgențe)
        if (password === "start") {
          return json({ success: true, user: { name: "Ruslan", role: "teacher" } }, corsHeaders);
        }

        // D1 Database Check (Dacă există)
        if (env.DB) {
           const username = body.username || "admin";
           const user = await env.DB.prepare("SELECT * FROM users WHERE password = ?").bind(password).first();
           if (user) return json({ success: true, user }, corsHeaders);
        }

        return json({ success: false, error: "Parolă incorectă" }, corsHeaders, 401);
      }

      // ==========================
      // ZONA 2: CHAT (/api/chat)
      // ==========================
      if (path === "/api/chat" && request.method === "POST") {
        const body = await request.clone().json().catch(() => ({}));
        
        // INPUT UNIVERSAL: Prindem mesajul indiferent cum îl trimite site-ul
        const userText = body.message || body.userMessage || body.prompt || body.text || body.content;

        if (!userText) {
          return json({ reply: "Mesaj gol." }, corsHeaders);
        }

        // Selectare API Key
        const apiKey = env.AI_API_KEY || env.MISTRAL_API_KEY || env.DEEPSEEK_API_KEY;
        let aiText = "Eroare: Nu ai setat AI_API_KEY în Cloudflare.";

        if (apiKey) {
            // Folosim Mistral (cel mai stabil)
            const aiReq = await fetch("https://api.mistral.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "mistral-small-latest",
                    messages: [
                        { role: "system", content: "Ești Cronicus, profesor de istorie. Răspunzi scurt." },
                        { role: "user", content: userText }
                    ]
                })
            });
            const aiData = await aiReq.json();
            aiText = aiData.choices?.[0]?.message?.content || "AI nu a răspuns.";
        }

        // OUTPUT UNIVERSAL: Trimitem răspunsul în toate formatele
        return json({
            response: aiText,
            reply: aiText,
            message: aiText,
            answer: aiText,
            choices: [{ message: { content: aiText } }]
        }, corsHeaders);
      }

      // ==========================
      // ZONA 3: STATIC FILES
      // ==========================
      // Orice nu e /api/ merge la HTML/CSS/JS
      return env.ASSETS.fetch(request);

    } catch (e) {
      return json({ error: e.message }, corsHeaders, 500);
    }
  }
};

// Helper simplu pentru JSON response
function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
