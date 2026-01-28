import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('/*', cors({
  origin: ['https://lectia-de-istorie.contact-ai.online', 'https://history-cosmos.contact-ai.online', 'http://localhost:8788'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// API ENDPOINTS
app.post('/api/cronicus', async (c) => {
  try {
    const { question, mode = 'rapid' } = await c.req.json();
    if (mode === 'rapid') {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.env.MISTRAL_API_KEY}` },
        body: JSON.stringify({
          model: 'open-mistral-7b',
          messages: [{ role: 'system', content: 'Ești CRONICUS, mentor rapid.' }, { role: 'user', content: question }],
          max_tokens: 300
        })
      });
      const data = await res.json();
      return c.json({ answer: data.choices[0].message.content });
    } else {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'system', content: 'Ești CRONICUS, expert istorie.' }, { role: 'user', content: question }],
          max_tokens: 2000
        })
      });
      const data = await res.json();
      return c.json({ answer: data.choices[0].message.content });
    }
  } catch (err) {
    return c.json({ error: 'Error', details: err.message }, 500);
  }
});

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Mock Login Endpoint (Replace with your logic later)
app.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    
    // Mock authentication - accept any non-empty credentials
    if (!username || !password) {
      return c.json({ error: 'Username și parolă sunt obligatorii' }, 400);
    }
    
    // Determine role based on username (mock logic)
    const isTeacher = username.toLowerCase().includes('prof') || username.toLowerCase().includes('teacher');
    const role = isTeacher ? 'teacher' : 'student';
    
    return c.json({
      success: true,
      message: "Autentificare reușită",
      user: {
        username: username,
        fullname: username === 'profesor' ? 'Profesor Demo' :
                  username === 'elev' ? 'Elev Demo' :
                  username.charAt(0).toUpperCase() + username.slice(1),
        role: role
      }
    });
  } catch (err) {
    return c.json({ error: 'Eroare la procesarea cererii', details: err.message }, 500);
  }
});

// Mock Register Endpoint
app.post('/register', async (c) => {
  try {
    const { username, password, fullname } = await c.req.json();
    
    if (!username || !password) {
      return c.json({ error: 'Username și parolă sunt obligatorii' }, 400);
    }
    
    return c.json({
      success: true,
      message: "Cont creat cu succes! Așteaptă aprobarea profesorului.",
      user: {
        username: username,
        fullname: fullname || username.charAt(0).toUpperCase() + username.slice(1),
        role: 'student' // Noi utilizatori sunt automat elevi
      }
    });
  } catch (err) {
    return c.json({ error: 'Eroare la procesarea cererii', details: err.message }, 500);
  }
});

// 🛑 IMPORTANT: FALLBACK FOR PAGES
// Acest cod spune: "Dacă nu e /api, lasă Cloudflare să servească fișierele statice (index.html)"
app.all('/*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
