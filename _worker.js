export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. CORS Headers
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // 2. API CHAT - TREBUIE SĂ FIE ÎNAINTE DE ASSETS!
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        console.log('[Worker] Chat request interceptat!');
        
        const { userMessage } = await request.json();
        
        if (!userMessage) {
          return new Response(
            JSON.stringify({ error: "Mesaj gol" }), 
            { 
              status: 400,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        // Verifică API key
        if (!env.DEEPSEEK_API_KEY) {
          console.error('[Worker] DEEPSEEK_API_KEY lipsește!');
          return new Response(
            JSON.stringify({ error: "API key lipsește din environment" }), 
            { 
              status: 500,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        // Apel DeepSeek
        const aiResponse = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { 
                role: "system", 
                content: "Ești un mentor de istorie înțelept și prietenos pentru platforma History-Cosmos." 
              },
              { role: "user", content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 1000
          })
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('[Worker] DeepSeek API Error:', aiResponse.status, errorText);
          
          // Fallback către Mistral
          if (env.MISTRAL_API_KEY) {
            console.log('[Worker] Încercare fallback Mistral...');
            const mistralResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${env.MISTRAL_API_KEY}`
              },
              body: JSON.stringify({
                model: "mistral-tiny",
                messages: [
                  { role: "system", content: "Ești un mentor de istorie." },
                  { role: "user", content: userMessage }
                ]
              })
            });
            
            if (mistralResponse.ok) {
              const mistralData = await mistralResponse.json();
              return new Response(
                JSON.stringify({ 
                  reply: mistralData.choices[0].message.content,
                  model: "mistral-fallback"
                }), 
                { headers: { "Content-Type": "application/json" } }
              );
            }
          }
          
          return new Response(
            JSON.stringify({ 
              error: `AI API Error: ${aiResponse.status}`, 
              details: errorText 
            }), 
            { 
              status: 500,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        const aiData = await aiResponse.json();
        const replyText = aiData.choices[0].message.content;

        console.log('[Worker] Răspuns AI generat cu succes');
        
        return new Response(
          JSON.stringify({ 
            reply: replyText,
            model: "deepseek-chat"
          }), 
          { headers: { "Content-Type": "application/json" } }
        );

      } catch (error) {
        console.error('[Worker] Exception în chat:', error);
        return new Response(
          JSON.stringify({ 
            error: "Eroare internă Worker", 
            details: error.message 
          }), 
          { 
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // 3. AUTHENTICATION ROUTES (păstrează logica ta existentă)
    // ... codul tău de auth aici ...

    // 4. ASSETS - TREBUIE SĂ FIE LA FINAL!
    return env.ASSETS.fetch(request);
  }
};
