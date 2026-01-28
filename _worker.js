import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS Configuration - Permite accesul de pe domeniul tău
app.use('/*', cors({
  origin: [
    'https://lectia-de-istorie.contact-ai.online',
    'https://history-cosmos.contact-ai.online', 
    'http://localhost:8788'
  ],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ==========================================
// CRONICUS ENDPOINT - DUAL PREMIUM ARCHITECTURE
// ==========================================
app.post('/api/cronicus', async (c) => {
  try {
    const { question, mode = 'rapid' } = await c.req.json();
    
    // Validare input
    if (!question || question.trim().length < 5) {
      return c.json({ error: 'Întrebare prea scurtă (minim 5 caractere)' }, 400);
    }

    // ==========================================
    // MOD RAPID ⚡ - MISTRAL API DIRECT (PREMIUM)
    // Consumă din creditul de $10
    // ==========================================
    if (mode === 'rapid') {
      if (!c.env.MISTRAL_API_KEY) {
        return c.json({ error: 'Mistral API key lipsește. Verifică setările Cloudflare!' }, 500);
      }

      const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
          model: 'open-mistral-7b',
          messages: [
            { 
              role: 'system', 
              content: `Tu ești CRONICUS, mentorul istoric pentru elevii claselor X-XII din Republica Moldova.

MOD RAPID - REGULI:
✅ CONCIS: 120-200 cuvinte maximum
✅ DIRECT: Răspunde în primele 2 propoziții  
✅ STRUCTURAT: 1) Definiție/fapt central 2) Context rapid 3) Legătură cu programa
✅ ÎNCURAJATOR: "Excelentă întrebare!", "Foarte bine!"

LIMBA: Română (adaptează la rusă dacă elevul scrie în rusă)` 
            },
            { role: 'user', content: question }
          ],
          max_tokens: 300,
          temperature: 0.7
        })
      });

      if (!mistralResponse.ok) {
        const errorData = await mistralResponse.json().catch(() => ({}));
        return c.json({ 
          error: `Mistral API error: ${mistralResponse.statusText}`,
          details: errorData
        }, mistralResponse.status);
      }

      const data = await mistralResponse.json();
      
      return c.json({
        answer: data.choices?.[0]?.message?.content || 'Răspuns indisponibil',
        mode: 'rapid',
        model: 'open-mistral-7b',
        provider: 'Mistral API Direct (Premium)',
        timestamp: new Date().toISOString(),
        metadata: {
          tokens_used: data.usage?.total_tokens || 0,
          credit_status: 'Consuming from $10 Mistral credit'
        }
      });
    } 
    
    // ==========================================
    // MOD PROFUND 🎓 - DEEPSEEK API DIRECT (PREMIUM)
    // Consumă din creditul de $5
    // ==========================================
    else {
      if (!c.env.DEEPSEEK_API_KEY) {
        return c.json({ error: 'DeepSeek API key lipsește. Verifică setările Cloudflare!' }, 500);
      }

      const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { 
              role: 'system', 
              content: `Tu ești CRONICUS, expert în Istoria Românilor și Universală pentru pregătirea BAC (clasele X-XII, Republica Moldova).

CÂND EVALUEZI UN ESEU BAC:
📊 **NOTA ESTIMATIVĂ: X/15 puncte**
✅ **PUNCTE FORTE:** [3 aspecte pozitive cu exemple din text]
⚠️ **DE ÎMBUNĂTĂȚIT:** [3 probleme + soluții concrete]
💡 **REFORMULARE ACADEMICĂ:** [Rescrie 1-2 propoziții ale elevului]
🎯 **STRATEGII PENTRU NOTA 10:** [3 recomandări specifice]

CÂND RĂSPUNZI LA ÎNTREBĂRI COMPLEXE:
1. Context istoric amplu 2. Analiză multicauzală 3. Dezvoltarea procesului
4. Consecințe multiple 5. Semnificația istorică 6. Conexiuni româno-universale

STIL: Academic dar accesibil, terminologie precisă, perspective multiple` 
            },
            { role: 'user', content: question }
          ],
          max_tokens: 2000,
          temperature: 0.7
        })
      });

      if (!deepseekResponse.ok) {
        const errorData = await deepseekResponse.json().catch(() => ({}));
        return c.json({ 
          error: `DeepSeek API error: ${deepseekResponse.statusText}`,
          details: errorData
        }, deepseekResponse.status);
      }

      const data = await deepseekResponse.json();
      
      return c.json({
        answer: data.choices?.[0]?.message?.content || 'Răspuns indisponibil',
        mode: 'profund',
        model: 'deepseek-chat',
        provider: 'DeepSeek API Direct (Premium)',
        timestamp: new Date().toISOString(),
        metadata: {
          tokens_used: data.usage?.total_tokens || 0,
          credit_status: 'Consuming from $5 DeepSeek credit'
        }
      });
    }

  } catch (error) {
    console.error('CRONICUS Error:', error);
    return c.json({ 
      error: 'Eroare internă la procesarea întrebării',
      details: error.message 
    }, 500);
  }
});

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    domain: 'lectia-de-istorie.contact-ai.online',
    architecture: {
      rapid: 'Mistral API Direct (Premium)',
      profund: 'DeepSeek API Direct (Premium)'
    }
  });
});

export default app;

