/**
 * ============================================
 * CLOUDFLARE WORKER: MENTOR AI BACKEND + AUTH (CORRECTED)
 * ============================================
 */

import {
  saveQuizToD1,
  updateQuizScore,
  getStudentQuizHistory,
  getQuizById,
  getStudentStats
} from './quiz-storage-d1.js';

export default {
  async fetch(request, env) {
    // 1. CORS Headers (Standard)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 2. Handle Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ============================================
    // ROUTING: AUTHENTICATION
    // ============================================
    if (path === '/login' && request.method === 'POST') {
      return handleLogin(request, env, corsHeaders);
    }

    if (path === '/register' && request.method === 'POST') {
      return handleRegister(request, env, corsHeaders);
    }

    // ============================================
    // ROUTING: QUIZ STORAGE
    // ============================================
    if (path === '/save-quiz' && request.method === 'POST') return handleSaveQuiz(request, env, corsHeaders);
    if (path === '/update-score' && request.method === 'POST') return handleUpdateScore(request, env, corsHeaders);
    if (path === '/quiz-history' && request.method === 'GET') return handleGetHistory(request, env, corsHeaders);
    if (path === '/student-stats' && request.method === 'GET') return handleGetStats(request, env, corsHeaders);

    // ============================================
    // ROUTING: AI CHAT (FIXED)
    // ============================================
    // Ascultăm atât pe '/' cât și pe '/api/chat' pentru siguranță
    if (request.method === 'POST' && (path === '/' || path === '/api/chat')) {
      try {
        const body = await request.clone().json();
        const { userMessage, mode = 'standard', language = 'RO' } = body;

        // Dacă nu există mesaj, ignorăm și lăsăm să treacă (poate e altceva)
        if (!userMessage) {
             return env.ASSETS.fetch(request);
        }

        const systemPrompt = language === 'RO'
          ? 'Ești Cronicus, mentor academic de istorie. Răspunde clar, analitic și bilingv (RO/RU) dacă este cazul.'
          : 'Вы Cronicus, академический наставник по истории.';

        let result;

        // Verificăm dacă avem cheile
        if (!env.DEEPSEEK_API_KEY && !env.MISTRAL_API_KEY) {
            throw new Error("LIPSĂ CHEI API: Verifică Cloudflare Environment Variables!");
        }

        // Încercăm DeepSeek
        if (mode !== 'backup') {
          try {
            result = await callDeepSeek(env, userMessage, systemPrompt, mode);
          } catch (error) {
            console.warn('⚠️ DeepSeek failed, switching to Mistral:', error.message);
            // Dacă DeepSeek cade, încercăm Mistral
            result = await callMistral(env, userMessage, systemPrompt);
          }
        } else {
          result = await callMistral(env, userMessage, systemPrompt);
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        // AICI returnăm eroarea reală către frontend ca să știm ce nu merge!
        return new Response(JSON.stringify({ 
            error: "Eroare AI Backend", 
            details: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // FALLBACK: SITE STATIC
    // ============================================
    return env.ASSETS.fetch(request);
  }
};

// --- FUNCȚIILE AUXILIARE RĂMÂN NESCHIMBATE ---
// (Copiază restul funcțiilor handleLogin, callDeepSeek etc. din codul tău vechi, ele sunt corecte)

async function handleLogin(request, env, corsHeaders) {
  try {
    const { username, password } = await request.json();
    const user = await env.DB.prepare(
      "SELECT id, username, role, fullname, status FROM users WHERE username = ? AND password = ?"
    ).bind(username, password).first();

    if (!user) return new Response(JSON.stringify({ error: "Utilizator/Parolă incorectă" }), { status: 401, headers: corsHeaders });
    if (user.status === 'pending') return new Response(JSON.stringify({ error: "Cont în așteptare" }), { status: 403, headers: corsHeaders });

    return new Response(JSON.stringify({ success: true, user }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleRegister(request, env, corsHeaders) {
  try {
    const { username, password, fullname } = await request.json();
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, username, password, role, fullname, status) VALUES (?, ?, ?, 'student', ?, 'pending')")
      .bind(id, username, password, fullname).run();
    return new Response(JSON.stringify({ success: true }), { status: 201, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: "User existent" }), { status: 400, headers: corsHeaders });
  }
}

async function callDeepSeek(env, userMessage, systemPrompt, mode) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY lipsă în Setări Cloudflare!');

  const isThinkingMode = (mode === 'thinking');
  const model = isThinkingMode ? 'deepseek-reasoner' : 'deepseek-chat';

  const response = await fetch('
