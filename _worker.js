/**
 * WORKER HISTORY-COSMOS - VERSIUNEA FINALĂ BLINDATĂ
 * Rezolvă problema 405 și conflictele de rutare.
 */

import {
  saveQuizToD1,
  updateQuizScore,
  getStudentQuizHistory,
  getStudentStats
} from './quiz-storage-d1.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Curățăm calea: /login/ devine /login (scoatem slash-ul de la final)
    const path = url.pathname.endsWith('/') && url.pathname.length > 1 
                 ? url.pathname.slice(0, -1) 
                 : url.pathname;

    // 1. CORS GLOBAL (Rezolvă orice blocaj de securitate)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Răspuns rapid pentru verificările browserului
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ============================================
    // ZONA 1: AUTHENTICATION (Login & Register)
    // ============================================
    // Acum prindem '/login' SAU '/api/login' ca să fim siguri
    if ((path === '/login' || path === '/api/login') && request.method === 'POST') {
      return handleLogin(request, env, corsHeaders);
    }

    if ((path === '/register' || path === '/api/register') && request.method === 'POST') {
      return handleRegister(request, env, corsHeaders);
    }

    // ============================================
    // ZONA 2: AI CHAT (Mentorul)
    // ============================================
    // Prindem cererea de chat indiferent cum e trimisă
    if (request.method === 'POST' && (path === '/' || path.includes('chat'))) {
      try {
        const body = await request.clone().json();
        
        // Dacă e mesaj de chat
        if (body && body.userMessage) {
           // TEST RAPID: Dacă scrii "TEST", răspunde direct
           if (body.userMessage === "TEST") {
             return new Response(JSON.stringify({ 
               reply: "✅ CONEXIUNE REUȘITĂ! Worker-ul te aude.",
               response: "✅ CONEXIUNE REUȘITĂ! Worker-ul te aude."
             }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
           }

           // Verificare Chei
           if (!env.DEEPSEEK_API_KEY && !env.MISTRAL_API_KEY) {
             return new Response(JSON.stringify({ error: "LIPSEȘTE CHEIA API!" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
           }

           // Logica AI (DeepSeek)
           const systemPrompt = "Ești Cronicus, un profesor de istorie pasionat.";
           const aiResponse = await callDeepSeek(env, body.userMessage, systemPrompt);
           
           return new Response(JSON.stringify(aiResponse), {
             headers: { ...corsHeaders, 'Content-Type': 'application/json' }
           });
        }
      } catch (e) {
        // Ignorăm erorile de JSON, poate nu era pentru AI
      }
    }

    // ============================================
    // ZONA 3: QUIZ (Baza de Date)
    // ============================================
    if (path === '/save-quiz' && request.method === 'POST') return handleSaveQuiz(request, env, corsHeaders);
    if (path === '/update-score' && request.method === 'POST') return handleUpdateScore(request, env, corsHeaders);
    if (path === '/quiz-history' && request.method === 'GET') return handleGetHistory(request, env, corsHeaders);
    if (path === '/student-stats' && request.method === 'GET') return handleGetStats(request, env, corsHeaders);

    // ============================================
    // ZONA 4: FALLBACK (Site Static)
    // ============================================
    // Dacă nu a fost prinsă mai sus, încărcăm HTML-ul (index.html, imagini, etc.)
    return env.ASSETS.fetch(request);
  }
};

// --- FUNCȚII AUXILIARE ---

async function handleLogin(request, env, corsHeaders) {
  try {
    const { username, password } = await request.json();
    // Verificăm dacă baza de date există
    if (!env.DB) throw new Error("Baza de date D1 nu este conectată!");
    
    const user = await env.DB.prepare(
      "SELECT * FROM users WHERE username = ? AND password = ?"
    ).bind(username, password).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "Utilizator sau parolă greșită!" }), { 
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
  try {
    const { username, password, fullname } = await request.json();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, username, password, role, fullname, status) VALUES (?, ?, ?, 'student', ?, 'pending')"
    ).bind(id, username, password, fullname).run();

    return new Response(JSON.stringify({ success: true }), { 
      status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Eroare la înregistrare (poate userul există deja)" }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
}

async function callDeepSeek(env, message, prompt) {
    const apiKey = env.DEEPSEEK_API_KEY;
    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'system', content: prompt }, { role: 'user', content: message }]
            })
        });
        const data = await response.json();
        return { 
            reply: data.choices[0].message.content,
            response: data.choices[0].message.content 
        };
    } catch (error) {
        // Fallback simplu în caz de eroare
        return { reply: "Eroare conexiune AI: " + error.message };
    }
}

// Funcții Quiz (simplificate pentru spațiu, asigură-te că importurile funcționează)
async function handleSaveQuiz(r, e, c) { try { const d = await r.json(); return new Response(JSON.stringify(await saveQuizToD1(e, d)), {headers: c}); } catch(err){ return new Response(JSON.stringify({error: err.message}), {status:500, headers:c}); } }
async function handleUpdateScore(r, e, c) { try { const {quizId, score, maxScore} = await r.json(); return new Response(JSON.stringify(await updateQuizScore(e, quizId, score, maxScore)), {headers: c}); } catch(err){ return new Response(JSON.stringify({error: err.message}), {status:500, headers:c}); } }
async function handleGetHistory(r, e, c) { try { const sId = new URL(r.url).searchParams.get('studentId'); return new Response(JSON.stringify(await getStudentQuizHistory(e, sId)), {headers: c}); } catch(err){ return new Response(JSON.stringify({error: err.message}), {status:500, headers:c}); } }
async function handleGetStats(r, e, c) { try { const sId = new URL(r.url).searchParams.get('studentId'); return new Response(JSON.stringify(await getStudentStats(e, sId)), {headers: c}); } catch(err){ return new Response(JSON.stringify({error: err.message}), {status:500, headers:c}); } }
