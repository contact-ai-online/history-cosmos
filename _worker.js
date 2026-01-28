import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('/*', cors({
  origin: ['https://history-cosmos.contact-ai.online', 'http://localhost:8788'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// ==========================================
// CRONICUS ENDPOINT - DUAL PREMIUM ARCHITECTURE
// ==========================================
app.post('/api/cronicus', async (c) => {
  try {
    const { question, mode = 'rapid' } = await c.req.json();
    
    if (!question || question.trim().length < 5) {
      return c.json({ error: 'Întrebare prea scurtă (minim 5 caractere)' }, 400);
    }

    // MOD RAPID ⚡ - MISTRAL API DIRECT (PREMIUM)
    if (mode === 'rapid') {
      if (!c.env.MISTRAL_API_KEY) {
        return c.json({ error: 'Mistral API key lipsește. Configurează cu: npx wrangler secret put MISTRAL_API_KEY' }, 500);
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

INTERZIS: Răspunsuri >250 cuvinte, termeni fără explicație
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
        console.error('Mistral API error:', errorData);
        return c.json({ 
          error: `Mistral API error: ${errorData.error?.message || mistralResponse.statusText}`,
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
          cost_estimate: `€${((data.usage?.total_tokens || 0) * 0.00025 / 1000).toFixed(6)}`,
          credit_status: 'Consuming from $10 Mistral credit',
          api_source: 'api.mistral.ai'
        }
      });
    } 
    
    // MOD PROFUND 🎓 - DEEPSEEK API DIRECT (PREMIUM)
    else {
      if (!c.env.DEEPSEEK_API_KEY) {
        return c.json({ 
          error: 'DeepSeek API key lipsește. Configurează cu: npx wrangler secret put DEEPSEEK_API_KEY' 
        }, 500);
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
        console.error('DeepSeek API error:', errorData);
        return c.json({ 
          error: `DeepSeek API error: ${errorData.error?.message || deepseekResponse.statusText}`,
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
          cost_estimate: `€${((data.usage?.total_tokens || 0) * 0.00014 / 1000).toFixed(6)}`,
          credit_status: 'Consuming from $5 DeepSeek credit',
          api_source: 'api.deepseek.com'
        }
      });
    }

  } catch (error) {
    console.error('CRONICUS Error:', error);
    return c.json({ 
      error: 'Eroare la procesarea întrebării',
      details: error.message 
    }, 500);
  }
});

// Health check cu informații complete despre dual premium
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    architecture: {
      rapid: 'Mistral API Direct (Premium) - $10 credit',
      profund: 'DeepSeek API Direct (Premium) - $5 credit'
    },
    cost_summary: {
      monthly_estimate: '€0.127',
      credit_duration: '107+ months with normal usage',
      breakdown: {
        rapid_mode: 'Mistral API - €0.043/month',
        profund_mode: 'DeepSeek API - €0.084/month'
      }
    }
  });
});

export default app;
