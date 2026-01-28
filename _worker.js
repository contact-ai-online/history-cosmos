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
          messages: [{ role: 'system', content: 'Ești CRONICUS, mentor rapid. Răspunsuri scurte (1359-1991).' }, { role: 'user', content: question }],
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
          messages: [{ role: 'system', content: 'Ești CRONICUS, expert istorie pentru evaluare BAC. Analizează profund și oferă răspunsuri structurate.' }, { role: 'user', content: question }],
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

// Login Endpoint with KV password verification
app.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    
    if (!username || !password) {
      return c.json({ error: 'Username și parolă sunt obligatorii' }, 400);
    }
    
    // Get stored password from KV with fallback to 'Ruslan2026'
    const storedPassword = await c.env.KV.get('ADMIN_PASSWORD') || 'Ruslan2026';
    
    // Verify password (for Ruslan only - teachers need password verification)
    const isRuslan = username.toLowerCase() === 'ruslan';
    if (isRuslan && password !== storedPassword) {
      return c.json({ error: 'Parolă incorectă' }, 401);
    }
    
    // Determine role based on username - Ruslan is teacher, others are students
    const role = isRuslan ? 'teacher' : 'student';
    
    return c.json({
      success: true,
      user: {
        username: username,
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

// Change Password Endpoint (Teacher only)
app.post('/api/change-password', async (c) => {
  try {
    const { username, currentPassword, newPassword } = await c.req.json();
    
    if (!username || !currentPassword || !newPassword) {
      return c.json({ error: 'Toate câmpurile sunt obligatorii' }, 400);
    }
    
    // Verify user is Ruslan (teacher)
    if (username.toLowerCase() !== 'ruslan') {
      return c.json({ error: 'Doar profesorul poate schimba parola' }, 403);
    }
    
    // Get stored password from KV with fallback
    const storedPassword = await c.env.KV.get('ADMIN_PASSWORD') || 'Ruslan2026';
    
    // Verify current password
    if (currentPassword !== storedPassword) {
      return c.json({ error: 'Parola curentă este incorectă' }, 401);
    }
    
    // Save new password to KV
    await c.env.KV.put('ADMIN_PASSWORD', newPassword);
    
    return c.json({
      success: true,
      message: 'Parola a fost schimbată cu succes!'
    });
  } catch (err) {
    return c.json({ error: 'Eroare la schimbarea parolei', details: err.message }, 500);
  }
});

// 🛑 IMPORTANT: FALLBACK FOR PAGES
// Acest cod spune: "Dacă nu e /api, lasă Cloudflare să servească fișierele statice (index.html)"
app.all('/*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
