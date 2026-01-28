import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS Configuration - Blindat pentru noul domeniu
app.use('/*', cors({
  origin: ['https://lectia-de-istorie.contact-ai.online', 'http://localhost:8788'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ==========================================
// CRONICUS ENDPOINT - DUAL PREMIUM API
// ==========================================
app.post('/api/cronicus', async (c) => {
  try {
    const { question, mode = 'rapid' } = await c.req.json();
    
    if (!question || question.trim().length < 5) {
      return c.json({ error: 'Întrebarea este prea scurtă.' }, 400);
    }

    if (mode === 'rapid') {
      // MOD RAPID ⚡ - MISTRAL API (Folosește creditul de $10)
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
          model: 'open-mistral-7b',
          messages: [
            { role: 'system', content: 'Ești CRONICUS, mentor rapid. Răspunzi concis (max 200 cuv) în română.' },
            { role: 'user', content: question }
          ],
          max_tokens: 300
        })
      });
      const data = await res.json();
      return c.json({ answer: data.choices[0].message.content, provider: 'Mistral Premium' });

    } else {
      // MOD PROFUND 🎓 - DEEPSEEK API (Folosește creditul de $5)
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Ești CRONICUS, expert istorie BAC Moldova. Analizează profund și academic.' },
            { role: 'user', content: question }
          ],
          max_tokens: 2000
        })
      });
      const data = await res.json();
      return c.json({ answer: data.choices[0].message.content, provider: 'DeepSeek Premium' });
    }
  } catch (err) {
    return c.json({ error: 'Server Error', details: err.message }, 500);
  }
});

// Health Check
app.get('/api/health', (c) => c.json({ status: 'ok', domain: 'lectia-de-istorie' }));

export default app;
