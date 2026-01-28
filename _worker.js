// CRONICUS CONFIGURATION
const CRONICUS_MODELS = {
  rapid: '@cf/mistral/mistral-7b-instruct-v0.1',
  profund: '@cf/meta/llama-3.1-70b-instruct'
};

const CRONICUS_RAPID_PROMPT = `Tu ești CRONICUS, mentorul istoric pentru elevii claselor X-XII din Republica Moldova.

ACOPERIRE CURRICULUM COMPLETĂ:
📚 Istoria Românilor (Preistorie → Contemporan) + Istoria Universală

MOD RAPID - REGULI:
✅ CONCIS: 120-200 cuvinte maximum
✅ DIRECT: Răspunde în primele 2 propoziții  
✅ STRUCTURAT: 1) Definiție/fapt central 2) Context rapid 3) Legătură cu programa
✅ ÎNCURAJATOR: "Excelentă întrebare!", "Foarte bine!"

INTERZIS: Răspunsuri >250 cuvinte, termeni fără explicație
LIMBA: Română (adaptează la rusă dacă elevul scrie în rusă)`;

const CRONICUS_PROFUND_PROMPT = `Tu ești CRONICUS, expert în Istoria Românilor și Universală pentru pregătirea BAC (clasele X-XII, Republica Moldova).

CÂND EVALUEZI UN ESEU BAC:
📊 **NOTA ESTIMATIVĂ: X/15 puncte**
✅ **PUNCTE FORTE:** [3 aspecte pozitive cu exemple din text]
⚠️ **DE ÎMBUNĂTĂȚIT:** [3 probleme + soluții concrete]
💡 **REFORMULARE ACADEMICĂ:** [Rescrie 1-2 propoziții ale elevului]
🎯 **STRATEGII PENTRU NOTA 10:** [3 recomandări specifice]

CÂND RĂSPUNZI LA ÎNTREBĂRI COMPLEXE:
1. Context istoric amplu 2. Analiză multicauzală 3. Dezvoltarea procesului
4. Consecințe multiple 5. Semnificația istorică 6. Conexiuni româno-universale

STIL: Academic dar accesibil, terminologie precisă, perspective multiple`;

// Hono.js Application
import { Hono } from 'hono';

const app = new Hono();

// CORS middleware
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  await next();
});

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    service: 'CRONICUS API',
    version: '1.0.0',
    description: 'Sistem AI pentru istorie - Republica Moldova',
    endpoints: {
      cronicus: 'POST /api/cronicus',
      health: 'GET /health'
    }
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// CRONICUS endpoint
app.post('/api/cronicus', async (c) => {
  try {
    // Validare input
    const body = await c.req.json();
    const { question, mode = 'rapid' } = body;

    // Validare întrebare
    if (!question || typeof question !== 'string') {
      return c.json({ 
        error: 'Întrebarea este obligatorie și trebuie să fie text' 
      }, 400);
    }

    if (question.trim().length < 5) {
      return c.json({ 
        error: 'Întrebarea trebuie să aibă minim 5 caractere' 
      }, 400);
    }

    // Validare mod
    const validModes = ['rapid', 'profund'];
    if (!validModes.includes(mode)) {
      return c.json({ 
        error: 'Mod invalid. Alegeți "rapid" sau "profund"' 
      }, 400);
    }

    // Selectare model și prompt
    const model = CRONICUS_MODELS[mode];
    const systemPrompt = mode === 'rapid' 
      ? CRONICUS_RAPID_PROMPT 
      : CRONICUS_PROFUND_PROMPT;

    // Construire mesaj pentru AI
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ];

    // Apel Cloudflare Workers AI
    const aiResponse = await c.env.AI.run(model, { messages });

    // Procesare răspuns
    const responseText = aiResponse.response || aiResponse;

    // Structurare răspuns JSON
    return c.json({
      success: true,
      mode: mode,
      model: model,
      question: question,
      answer: responseText,
      timestamp: new Date().toISOString(),
      metadata: {
        wordCount: responseText.split(/\s+/).length,
        modeDescription: mode === 'rapid' 
          ? 'Răspuns rapid (120-200 cuvinte)' 
          : 'Analiză profundă + evaluare eseuri BAC'
      }
    });

  } catch (error) {
    console.error('Eroare CRONICUS:', error);

    // Error handling specific
    if (error.message.includes('AI')) {
      return c.json({ 
        error: 'Eroare serviciu AI. Vă rugăm încercați mai târziu.',
        details: error.message 
      }, 503);
    }

    return c.json({ 
      error: 'Eroare internă server',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
});

// Fallback pentru rute necunoscute
app.all('*', (c) => {
  return c.json({ error: 'Endpoint negăsit' }, 404);
});

export default app;
