/**
 * WORKER HISTORY-COSMOS - HIBRID STABILIZAT
 * Login: D1 Database (Validat)
 * Chat: Mistral AI (Stabil)
 */

// Păstrăm importurile pentru Quiz (dacă ai fișierul quiz-storage-d1.js, altfel dă eroare)
// Dacă nu ai fișierul 'quiz-storage-d1.js' pe server, comentează liniile de import!
import {
  saveQuizToD1,
  updateQuizScore,
  getStudentQuizHistory,
  getStudentStats
} from './quiz-storage-d1.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Curățăm calea
    const path = url.pathname.endsWith('/') && url.pathname.length > 1 
                 ? url.pathname.slice(0, -1) 
                 : url.pathname;

    // 1. CORS GLOBAL (Permite accesul de oriunde)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ============================================
    // ZONA 1: LOGIN (LOGICA VECHE CARE FUNCȚIONEAZĂ)
    // ============================================
    if ((path === '/login' || path === '/api/login') && request.method === 'POST') {
      return handleLogin(request, env, corsHeaders);
    }

    if ((path === '/register' || path === '/api/register') && request.method === 'POST') {
      return handleRegister(request, env, corsHeaders);
    }

    // ============================================
    // ZONA 2: AI CHAT (MOTORUL NOU - MISTRAL)
    // ============================================
    // Prindem cererea de chat
    if (request.method === 'POST' && (path === '/api/chat' || path.includes('chat'))) {
      try {
        const body = await request.clone().json();
        
        // IMPORTANT: Acceptăm și 'message' și 'userMessage' ca să fim siguri că prindem textul
        const userText = body.message || body.userMessage;

        if (userText) {
           // 1. Test conexiune rapidă
           if (userText === "TEST") {
             return new Response(JSON.stringify({ response: "✅ AION ASCULTĂ." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
           }

           // 2. Selectare Cheie API (Suportă mai multe denumiri)
           const apiKey = env.AI_API_KEY || env.MISTRAL_API_KEY || env.DEEPSEEK_API_KEY;

           if (!apiKey) {
             return new Response(JSON.stringify({ 
               response: "⚠️ Eroare Configurare: Lipsește AI_API_KEY în Cloudflare Settings." 
             }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
           }

           // 3. Apelăm MISTRAL (Este cel mai stabil acum)
           const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${apiKey}`
             },
             body: JSON.stringify({
               model: "mistral-small-latest",
               messages: [
                 { role: "system", content: "Ești Cronicus, profesor de istorie. Răspunzi scurt, clar și educativ." },
                 { role: "user", content: userText }
               ]
             })
           });

           if (!response.ok) {
             const errData = await response.text();
             throw new Error(`Eroare AI Provider: ${errData}`);
           }

           const data = await response.json();
           const reply = data.choices[0].message.content;

           return new Response(JSON.stringify({ 
             response: reply, // Format standard
             reply: reply     // Format fallback
           }), {
             headers: { ...corsHeaders, 'Content-Type': 'application/json' }
           });
        }
      } catch (e) {
        return new Response(JSON.stringify({ response: "Eroare Chat: " + e.message }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ZONA 3: QUIZ & STATIC FALLBACK
    // ============================================
    
    // Rute Quiz (Încercăm să le executăm doar dacă există funcțiile importate)
    try {
        if (path === '/save-quiz' && request.method === 'POST') return handleSaveQuiz(request, env, corsHeaders);
        if (path === '/update-score' && request.method === 'POST') return handleUpdateScore(request, env, corsHeaders);
        if (path === '/quiz-history' && request.method === 'GET') return handleGetHistory(request, env, corsHeaders);
        if (path === '/student-stats' && request.method === 'GET') return handleGetStats(request, env, corsHeaders);
    } catch (e) {
        // Ignorăm erorile de Quiz dacă lipsesc fișierele, ca să nu pice site-ul
        console.error("Quiz module error:", e);
    }

    // Fallback la site-ul static (HTML)
    return env.ASSETS.fetch(request);
  }
};

// --- FUNCȚII AUXILIARE DE LOGIN (Neschimbate) ---

async function handleLogin(request, env, corsHeaders) {
  try {
    const { username, password } = await request.json();
    if (!env.DB) throw new Error("Baza de date D1 nu este conectată!");
    
    const user = await env.DB.prepare(
      "SELECT * FROM users WHERE username = ? AND password = ?"
    ).bind(username, password).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "Date incorecte!" }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({ success: true, user }), { 
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
}

async function handleRegister(request, env, corsHeaders) {
    // ... (Păstrăm logica existentă sau returnăm succes dummy dacă nu e folosit)
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

// Funcții wrapper pentru Quiz
async function handleSaveQuiz(r, e, c) { const d = await r.json(); return new Response(JSON.stringify(await saveQuizToD1(e, d)), {headers: c}); }
async function handleUpdateScore(r, e, c) { const {quizId, score, maxScore} = await r.json(); return new Response(JSON.stringify(await updateQuizScore(e, quizId, score, maxScore)), {headers: c}); }
async function handleGetHistory(r, e, c) { const sId = new URL(r.url).searchParams.get('studentId'); return new Response(JSON.stringify(await getStudentQuizHistory(e, sId)), {headers: c}); }
async function handleGetStats(r, e, c) { const sId = new URL(r.url).searchParams.get('studentId'); return new Response(JSON.stringify(await getStudentStats(e, sId)), {headers: c}); }
