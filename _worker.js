/**
 * AION ORCHESTRATOR v6.0 - HYBRID ENGINE
 * Autor: RuslanOS Master Brain
 * Funcție: Unifică Login D1, Quiz și AI (Mistral/DeepSeek) sub un singur scut.
 */

import { saveQuizToD1, updateQuizScore, getStudentQuizHistory, getStudentStats } from './quiz-storage-d1.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, ""); // Elimină slash-ul final dacă există

    // 1. SCUTUL CORS (Permite tot, blochează erorile de securitate)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
      // ============================================
      // ZONA A: LOGIN & ACCES (Garantează intrarea)
      // ============================================
      if (path.includes('login')) {
        const body = await request.json();
        const { username, password } = body;

        // Fail-safe: Dacă scrii 'start', intri indiferent de ce zice baza de date
        if (password === 'start') {
          return new Response(JSON.stringify({ success: true, user: { name: "Ruslan", role: "teacher" } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Căutare în D1 (Dacă DB e conectată)
        if (env.DB) {
          const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND password = ?").bind(username, password).first();
          if (user) return new Response(JSON.stringify({ success: true, user }), { headers: corsHeaders });
        }
        
        return new Response(JSON.stringify({ error: "Date incorecte" }), { status: 401, headers: corsHeaders });
      }

      // ============================================
      // ZONA B: CHAT AI (Adaptorul Universal)
      // ============================================
      if (path.includes('chat') || (request.method === 'POST' && path === "")) {
        const body = await request.clone().json();
        
        // Căutăm mesajul sub orice denumire posibilă (Hibrid)
        const userText = body.message || body.userMessage || body.prompt || body.text || body.content;

        if (!userText) return new Response(JSON.stringify({ reply: "Mesaj gol recepționat." }), { headers: corsHeaders });

        // Alegem prima cheie disponibilă din Cloudflare Settings
        const apiKey = env.AI_API_KEY || env.MISTRAL_API_KEY || env.DEEPSEEK_API_KEY;
        
        if (!apiKey) {
          return new Response(JSON.stringify({ reply: "⚠️ Eroare: Setează AI_API_KEY în Cloudflare!" }), { headers: corsHeaders });
        }

        // Apelăm Mistral (cel mai stabil acum)
        const aiResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "mistral-small-latest",
            messages: [{ role: "system", content: "Ești Cronicus, profesor de istorie. Răspunzi scurt și util." }, { role: "user", content: userText }]
          })
        });

        const data = await aiResponse.json();
        const text = data.choices?.[0]?.message?.content || "AI indisponibil.";

        // RĂSPUNS HIBRID (Trimitem toate formatele deodată ca să "nimerim" ce vrea site-ul)
        return new Response(JSON.stringify({
          response: text,       // Format 1
          reply: text,          // Format 2
          message: text,        // Format 3
          answer: text,         // Format 4
          choices: [{ message: { content: text } }] // Format 5 (OpenAI style)
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ============================================
      // ZONA C: QUIZ & STATS
      // ============================================
      if (path.includes('save-quiz')) return new Response(JSON.stringify(await saveQuizToD1(env, await request.json())), { headers: corsHeaders });
      if (path.includes('quiz-history')) return new Response(JSON.stringify(await getStudentQuizHistory(env, new URL(request.url).searchParams.get('studentId'))), { headers: corsHeaders });

    } catch (e) {
      // Dacă ceva crapă, returnăm eroarea curat
      return new Response(JSON.stringify({ error: e.message, reply: "Eroare tehnică: " + e.message }), { headers: corsHeaders });
    }

    // FALLBACK: Încarcă site-ul static (HTML/CSS/JS)
    return env.ASSETS.fetch(request);
  }
};
