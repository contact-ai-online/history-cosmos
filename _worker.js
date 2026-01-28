/**
 * HISTORY-COSMOS WORKER v3.0 - MONOLITIC SAFE
 * Elimină dependențele externe, păstrează logica bună de rutare
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.endsWith('/') && url.pathname.length > 1 
                 ? url.pathname.slice(0, -1) 
                 : url.pathname;

    // CORS universal
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ==========================================
      // LOGIN: Acceptă ambele rute pentru siguranță
      // ==========================================
      if ((path === '/login' || path === '/api/login') && request.method === 'POST') {
        const { username, password } = await request.json();

        // 🔑 BACKDOOR PENTRU TESTARE (Elimină blocajul D1)
        if (password === 'start') {
          return jsonResponse({
            success: true,
            user: { 
              id: 'debug',
              name: username || 'Ruslan', 
              role: 'teacher',
              fullname: 'Debug User'
            }
          }, corsHeaders);
        }

        // D1 Logic (doar dacă backdoor-ul nu funcționează)
        if (!env.DB) {
          return jsonResponse({
            error: 'Baza de date D1 nu este conectată!'
          }, corsHeaders, 500);
        }
        
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ? AND password = ?"
        ).bind(username, password).first();

        if (!user) {
          return jsonResponse({
            error: 'Utilizator sau parolă greșită!'
          }, corsHeaders, 401);
        }

        return jsonResponse({ success: true, user }, corsHeaders);
      }

      // ==========================================
      // CHAT: Acceptă /chat și /api/chat
      // ==========================================
      if (request.method === 'POST' && (path === '/chat' || path === '/api/chat')) {
        const body = await request.json().catch(() => ({}));
        
        // INPUT UNIVERSAL
        const userMessage = body.message || body.userMessage || body.prompt || body.text;

        if (!userMessage) {
          return jsonResponse({ reply: 'Mesaj gol.' }, corsHeaders);
        }

        // TEST RAPID
        if (userMessage.toUpperCase() === 'TEST') {
          return jsonResponse({ 
            reply: '✅ CONEXIUNE REUȘITĂ! Worker funcționează perfect!',
            response: '✅ CONEXIUNE REUȘITĂ! Worker funcționează perfect!'
          }, corsHeaders);
        }

        // Verificare API Key
        const apiKey = env.DEEPSEEK_API_KEY || env.MISTRAL_API_KEY || env.AI_API_KEY;
        if (!apiKey) {
          return jsonResponse({
            reply: '⚠️ Eroare: Setează DEEPSEEK_API_KEY în Cloudflare Dashboard'
          }, corsHeaders, 500);
        }

        // Apel AI cu fallback
        const aiResponse = await callAI(apiKey, userMessage);
        return jsonResponse(aiResponse, corsHeaders);
      }

      // ==========================================
      // REGISTER: Placeholder safe
      // ==========================================
      if ((path === '/register' || path === '/api/register') && request.method === 'POST') {
        return jsonResponse({
          success: false,
          error: 'Înregistrarea va fi activată după repararea login-ului'
        }, corsHeaders);
      }

      // ==========================================
      // QUIZ: Placeholder safe (nu crapă Worker-ul)
      // ==========================================
      if (path.includes('quiz') || path.includes('score') || path.includes('stats')) {
        return jsonResponse({
          note: 'Funcția Quiz va fi activată după stabilizarea sistemului'
        }, corsHeaders);
      }

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({
        error: 'Server error: ' + error.message
      }, corsHeaders, 500);
    }

    // Fallback pentru fișiere statice
    return env.ASSETS.fetch(request);
  }
};

// ==========================================
// FUNCȚII HELPER (Toate în același fișier)
// ==========================================

function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

async function callAI(apiKey, message) {
  const systemPrompt = "Ești Cronicus, profesor de istorie. Răspunde scurt și clar.";
  
  try {
    // Încercăm DeepSeek
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API Error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'Fără răspuns AI';

    // OUTPUT UNIVERSAL (toate formatele)
    return {
      reply: text,
      response: text,
      message: text,
      answer: text
    };

  } catch (error) {
    // Fallback pentru erori AI
    return {
      reply: `⚠️ AI temporar indisponibil. Eroare: ${error.message}. Te rog reîncearcă în câteva secunde.`,
      response: 'Eroare AI'
    };
  }
}
