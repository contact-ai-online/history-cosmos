export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // 1. CONFIGURARE CORS (Să nu avem erori de browser)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. LOGARE SIMPLĂ (OLD SCHOOL) - CA SĂ INTRI IMEDIAT
    // Nu mai interogăm baza de date D1. Verificăm direct parola.
    if (url.pathname === "/login" && method === "POST") {
      try {
        const body = await request.json();
        
        // AICI E CHEIA: Parola e hardcodată, deci nu are ce să se strice.
        if (body.password === "start" || body.password === "admin") {
          return new Response(JSON.stringify({ 
            success: true, 
            role: "teacher", 
            name: "Ruslan" 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } else {
          return new Response(JSON.stringify({ success: false, error: "Parolă incorectă" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: "Eroare JSON" }), { status: 400 });
      }
    }

    // 3. CHAT AI (PARTEA NOUĂ - CA SĂ RĂSPUNDĂ MISTRAL)
    if (url.pathname === "/api/chat" && method === "POST") {
      try {
        const body = await request.json();
        const userMessage = body.message || "Salut";

        // Verificăm dacă ai pus cheia. Dacă nu, dăm un răspuns de test.
        if (!env.AI_API_KEY) {
           return new Response(JSON.stringify({ 
             response: "⚠️ AION: Nu am găsit cheia AI_API_KEY în setări, dar conexiunea funcționează!" 
           }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Apelăm Mistral
        const aiResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.AI_API_KEY}`
          },
          body: JSON.stringify({
            model: "mistral-small-latest",
            messages: [
              { role: "system", content: "Ești un profesor de istorie util." },
              { role: "user", content: userMessage }
            ],
            temperature: 0.7
          })
        });

        const aiData = await aiResponse.json();
        const replyText = aiData.choices?.[0]?.message?.content || "Eroare la AI.";

        return new Response(JSON.stringify({ response: replyText }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (error) {
        return new Response(JSON.stringify({ 
          response: "Eroare de conexiune AI.",
          details: error.message 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 4. RESTUL SITE-ULUI (HTML/CSS)
    return env.ASSETS.fetch(request);
  }
};
