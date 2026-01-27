import {
  saveQuizToD1,
  updateQuizScore,
  getStudentQuizHistory,
  getQuizById,
  getStudentStats
} from './quiz-storage-d1.js';

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/login' && request.method === 'POST') return handleLogin(request, env, corsHeaders);
    if (path === '/register' && request.method === 'POST') return handleRegister(request, env, corsHeaders);
    if (path === '/save-quiz' && request.method === 'POST') return handleSaveQuiz(request, env, corsHeaders);
    if (path === '/update-score' && request.method === 'POST') return handleUpdateScore(request, env, corsHeaders);
    if (path === '/quiz-history' && request.method === 'GET') return handleGetHistory(request, env, corsHeaders);
    if (path === '/student-stats' && request.method === 'GET') return handleGetStats(request, env, corsHeaders);

    if (request.method === 'POST' && (path === '/' || path === '/api/chat')) {
      try {
        const body = await request.json();
        const { userMessage, mode = 'standard', language = 'RO' } = body;
        if (!userMessage) return env.ASSETS.fetch(request);

        const systemPrompt = language === 'RO' ? 'Ești Cronicus, mentor academic de istorie.' : 'Вы Cronicus, наставник по истории.';
        let result;

        try {
          result = await callDeepSeek(env, userMessage, systemPrompt, mode);
        } catch (error) {
          result = await callMistral(env, userMessage, systemPrompt);
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleLogin(request, env, corsHeaders) {
  const { username, password } = await request.json();
  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND password = ?").bind(username, password).first();
  if (!user) return new Response(JSON.stringify({ error: "Eroare login" }), { status: 401, headers: corsHeaders });
  return new Response(JSON.stringify({ success: true, user }), { status: 200, headers: corsHeaders });
}

async function handleRegister(request, env, corsHeaders) {
  const { username, password, fullname } = await request.json();
  await env.DB.prepare("INSERT INTO users (id, username, password, role, fullname, status) VALUES (?, ?, ?, 'student', ?, 'pending')")
    .bind(crypto.randomUUID(), username, password, fullname).run();
  return new Response(JSON.stringify({ success: true }), { status: 201, headers: corsHeaders });
}

async function callDeepSeek(env, userMessage, systemPrompt, mode) {
  const apiKey = env.DEEPSEEK_API_KEY;
  const isThinking = (mode === 'thinking');
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: isThinking ? 'deepseek-reasoner' : 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }]
    })
  });
  const data = await response.json();
  return { provider: 'deepseek', response: data.choices[0].message.content };
}

async function callMistral(env, userMessage, systemPrompt) {
  const apiKey = env.MISTRAL_API_KEY;
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'mistral-medium',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }]
    })
  });
  const data = await response.json();
  return { provider: 'mistral', response: data.choices[0].message.content };
}

async function handleSaveQuiz(r, e, c) { try { const d = await r.json(); return new Response(JSON.stringify(await saveQuizToD1(e, d)), {headers: c}); } catch(err){ return new Response(JSON.stringify({error: err.message}), {status:500, headers:c}); } }
async function handleUpdateScore(r, e, c) { try { const {quizId, score, maxScore} = await r.json(); return new Response(JSON.stringify(await updateQuizScore(e, quizId, score, maxScore)), {headers: c}); } catch(err){ return new Response(JSON.stringify({error: err.message}), {status:500, headers:c}); } }
async function handleGetHistory(r, e, c) { try { const sId = new URL(r.url).searchParams.get('studentId'); return new Response(JSON.stringify(await getStudentQuizHistory(e, sId)), {headers: c}); } catch(err){ return new Response(JSON.stringify({error: err.message}), {status:500, headers:c}); } }
async function handleGetStats(r, e, c) { try { const sId = new URL(r.url).searchParams.get('studentId'); return new Response(JSON.stringify(await getStudentStats(e, sId)), {headers: c}); } catch(err){ return new Response(JSON.stringify({error: err.message}), {status:500, headers:c}); } }
