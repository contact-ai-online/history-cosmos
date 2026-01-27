/**
 * ============================================
 * CLOUDFLARE WORKER: MENTOR AI BACKEND + AUTH
 * ============================================
 * * INCLUDE:
 * 1. AI Proxy (DeepSeek + Mistral)
 * 2. D1 Storage (Quiz-uri)
 * 3. AUTHENTICATION (Login & Register via D1 users table)
 * 4. STATIC ASSETS (Site-ul HTML)
 */

// Import D1 storage functions
import {
  saveQuizToD1,
  updateQuizScore,
  getStudentQuizHistory,
  getQuizById,
  getStudentStats
} from './quiz-storage-d1.js';

export default {
  async fetch(request, env) {
    // CORS Headers (permite accesul de pe frontend)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ============================================
    // ROUTING: AUTHENTICATION
    // ============================================

    // 1. LOGIN
    if (path === '/login' && request.method === 'POST') {
      return handleLogin(request, env, corsHeaders);
    }

    // 2. REGISTER (Elevi)
    if (path === '/register' && request.method === 'POST') {
      return handleRegister(request, env, corsHeaders);
    }

    // ============================================
    // ROUTING: QUIZ STORAGE (D1)
    // ============================================
    
    // Save Quiz
    if (path === '/save-quiz' && request.method === 'POST') {
      return handleSaveQuiz(request, env, corsHeaders);
    }
    
    // Update Score
    if (path === '/update-score' && request.method === 'POST') {
      return handleUpdateScore(request, env, corsHeaders);
    }
    
    // Get History
    if (path === '/quiz-history' && request.method === 'GET') {
      return handleGetHistory(request, env, corsHeaders);
    }
    
    // Get Student Stats
    if (path === '/student-stats' && request.method === 'GET') {
      return handleGetStats(request, env, corsHeaders);
    }
    
    // ============================================
    // ROUTING: AI CHAT (DeepSeek / Mistral)
    // ============================================

    // Detectăm dacă este un request pentru AI (POST la root sau cu JSON body)
    // Adăugăm o verificare suplimentară pentru a nu bloca alte POST-uri
    if (request.method === 'POST' && path === '/') {
      try {
        const body = await request.clone().json(); // Clonăm pentru a nu consuma stream-ul dacă nu e pentru AI
        const { userMessage, mode = 'standard', language = 'RO' } = body;

        if (userMessage) {
            const systemPrompt = language === 'RO'
              ? 'Ești Cronicus, mentor academic de istorie. Răspunde clar, analitic și bilingv (RO/RU) dacă este cazul. Oferă explicații structurate și exemple concrete.'
              : 'Вы Cronicus, академический наставник по истории. Отвечайте четко, аналитически и на двух языках (RO/RU) при необходимости.';

            let result;

            // PHASE 1: Try DeepSeek
            if (mode !== 'backup') {
              try {
                result = await callDeepSeek(env, userMessage, systemPrompt, mode);
              } catch (error) {
                console.warn('⚠️ DeepSeek failed, failover to Mistral:', error.message);
                result = await callMistral(env, userMessage, systemPrompt);
              }
            } else {
              // PHASE 2: Direct Mistral
              result = await callMistral(env, userMessage, systemPrompt);
            }

            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
      } catch (error) {
        // Dacă nu e JSON valid sau nu e pentru AI, continuăm execuția (nu returnăm eroare aici)
        // Asta permite ca request-ul să ajungă la ASSETS dacă e cazul
      }
    }

    // ============================================
    // 3. SITE STATIC (Linia Magică!)
    // ============================================
    // Dacă niciuna din rutele de mai sus nu s-a potrivit,
    // înseamnă că utilizatorul vrea index.html, imagini sau CSS.
    return env.ASSETS.fetch(request);
  }
};

// ============================================
// FUNCȚII AUXILIARE: AUTHENTICATION
// ============================================

async function handleLogin(request, env, corsHeaders) {
  try {
    const { username, password } = await request.json();

    const user = await env.DB.prepare(
      "SELECT id, username, role, fullname, status FROM users WHERE username = ? AND password = ?"
    ).bind(username, password).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "Utilizator sau parolă incorectă!" }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (user.status === 'pending') {
      return new Response(JSON.stringify({ error: "Contul tău așteaptă aprobarea profesorului!" }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (user.status === 'blocked') {
      return new Response(JSON.stringify({ error: "Cont blocat. Contactează profesorul." }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, user }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

    return new Response(JSON.stringify({ success: true, message: "Cont creat! Așteaptă aprobarea." }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Acest nume de utilizator există deja!" }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================
// FUNCȚII AUXILIARE: AI (DeepSeek & Mistral)
// ============================================

async function callDeepSeek(env, userMessage, systemPrompt, mode) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');

  const isThinkingMode = (mode === 'thinking');
  const model = isThinkingMode ? 'deepseek-reasoner' : 'deepseek-chat';

  const requestBody = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    max_tokens: 2000
  };

  if (!isThinkingMode) requestBody.temperature = 0.7;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) throw new Error(`DeepSeek API Error`);

  const data = await response.json();
  const choice = data.choices[0];

  return {
    provider: 'deepseek',
    model: model,
    response: choice.message.content,
    thinkingProcess: isThinkingMode && choice.message.reasoning_content ? choice.message.reasoning_content : null
  };
}

async function callMistral(env, userMessage, systemPrompt) {
  const apiKey = env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY missing');

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'mistral-medium',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: 0.7,
      max_tokens: 1500
    })
  });

  if (!response.ok) throw new Error(`Mistral API Error`);

  const data = await response.json();
  return {
    provider: 'mistral',
    model: 'mistral-medium',
    response: data.choices[0].message.content,
    thinkingProcess: null
  };
}

// ============================================
// FUNCȚII AUXILIARE: QUIZ D1 HANDLERS
// ============================================

async function handleSaveQuiz(request, env, corsHeaders) {
  try {
    const quizData = await request.json();
    const result = await saveQuizToD1(env, quizData);
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function handleUpdateScore(request, env, corsHeaders) {
  try {
    const { quizId, score, maxScore } = await request.json();
    const result = await updateQuizScore(env, quizId, score, maxScore);
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function handleGetHistory(request, env, corsHeaders) {
  try {
    const url = new URL(request.url);
    const studentId = url.searchParams.get('studentId');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    if (!studentId) throw new Error('studentId required');
    
    const quizzes = await getStudentQuizHistory(env, studentId, limit, offset);
    return new Response(JSON.stringify(quizzes), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function handleGetStats(request, env, corsHeaders) {
  try {
    const url = new URL(request.url);
    const studentId = url.searchParams.get('studentId');
    if (!studentId) throw new Error('studentId required');
    
    const stats = await getStudentStats(env, studentId);
    return new Response(JSON.stringify(stats), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}