/**
 * SOLUȚIE FINALĂ HISTORY-COSMOS
 * Acest cod prioritizează AI-ul și afișează erorile direct în chat.
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
    
    // 1. HEADERS PENTRU SECURITATE (CORS)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Răspuns rapid pentru verificări
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ======================================================
    // ZONA DE INTERCEPTARE AI (AICI ESTE SECRETUL!)
    // ======================================================
    // Ascultăm orice POST care pare a fi un mesaj de chat
    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/api/chat')) {
      
      // Încercăm să citim mesajul
      let body;
      try {
        body = await request.clone().json();
      } catch (e) {
        // Dacă nu e JSON, e probabil o încărcare de pagină, lăsăm să treacă
        return env.ASSETS.fetch(request);
      }

      // Dacă are "userMessage", SIGUR e pentru Mentor!
      if (body && body.userMessage) {
        try {
          const { userMessage, mode = 'standard', language = 'RO' } = body;

          // 1. TEST DE CONEXIUNE (Debug)
          // Scrie "TEST" în chat și vei primi răspuns instant fără AI
          if (userMessage === "TEST") {
            return new Response(JSON.stringify({ 
              provider: 'system', 
              response: "✅ CONEXIUNE REUȘITĂ! Worker-ul funcționează. Problema e la cheia DeepSeek." 
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
          }

          // 2. VERIFICARE CHEI
          if (!env.DEEPSEEK_API_KEY && !env.MISTRAL_API_KEY) {
            throw new Error("LIPSĂ CHEI API ÎN CLOUDFLARE! Mergi la Settings -> Variables.");
          }

          const systemPrompt = language === 'RO' 
            ? 'Ești Cronicus, profesor de istorie. Răspunde scurt și la obiect.' 
            : 'You are a history teacher.';

          // 3. APEL CĂTRE AI (DeepSeek)
          let aiResponse;
          try {
             aiResponse = await callDeepSeek(env, userMessage, systemPrompt);
          } catch (deepSeekError) {
             // Dacă pică DeepSeek, încercăm Mistral
             aiResponse = await callMistral(env, userMessage, systemPrompt);
          }

          return new Response(JSON.stringify(aiResponse), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (finalError) {
          // AICI ESTE MAGIA: Trimitem eroarea ca mesaj în chat!
          return new Response(JSON.stringify({ 
            provider: 'error', 
            response: `⚠️ EROARE SERVER: ${finalError.message}` 
          }), {
            status: 200, // Trimitem 200 ca să afișeze mesajul în chat, nu în consolă
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // ======================================================
    // RUTELE PENTRU LOGIN ȘI QUIZ
    // ======================================================
    if (url.pathname === '/login' && request.method === 'POST') return handleLogin(request, env, corsHeaders);
    if (url.pathname === '/register' && request.method === 'POST') return handleRegister(request, env, corsHeaders);
    // ... restul rutelor de quiz sunt ok ...

    // FINAL: Dacă nu e nimic de mai sus, încarcă site-ul (HTML/CSS)
    return env.ASSETS.fetch(request);
  }
};

// --- FUNCȚIILE AJUTĂTOARE ---

async function callDeepSeek(env, message, prompt) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("Nu am găsit DEEPSEEK_API_KEY.");
  
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: message }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    // Verificăm dacă e eroare de credit
    if (response.status === 402) throw new Error("Fonduri insuficiente pe DeepSeek!");
    if (response.status === 401) throw new Error("Cheie DeepSeek invalidă!");
    throw new Error(`DeepSeek Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return { provider: 'deepseek', response: data.choices[0].message.content };
}

async function callMistral(env, message, prompt) {
  if (!env.MISTRAL_API_KEY) throw new Error("DeepSeek a picat și MISTRAL_API_KEY lipsește.");
  
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.MISTRAL_API_KEY}` },
    body: JSON.stringify({
      model: 'mistral-medium',
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: message }]
    })
  });

  const data = await response.json();
  return { provider: 'mistral', response: data.choices[0].message.content };
}

// Păstrează funcțiile de Login/Register de jos, ele merg bine.
async function handleLogin(r, e, c) { const {username, password} = await r.json(); const u = await e.DB.prepare("SELECT * FROM users WHERE username=? AND password=?").bind(username, password).first(); return new Response(JSON.stringify(u ? {success:true, user:u} : {error:"Login eșuat"}), {headers:c}); }
async function handleRegister(r, e, c) { const {username, password, fullname} = await r.json(); await e.DB.prepare("INSERT INTO users (id, username, password, role, fullname, status) VALUES (?, ?, ?, 'student', ?, 'pending')").bind(crypto.randomUUID(), username, password, fullname).run(); return new Response(JSON.stringify({success:true}), {status:201, headers:c}); }
