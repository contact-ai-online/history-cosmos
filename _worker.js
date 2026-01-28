export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    
    // 1. HEADERS CORS STANDARD (Pentru a evita erorile de browser în dev)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // 2. GESTIONARE PREFLIGHT (OPTIONS)
    // Dacă browserul întreabă "Am voie să fac POST?", răspundem imediat "DA".
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // 3. RUTE API & LOGICĂ BACKEND (Prioritate Maximă)
    
    // -> Ruta de Test (Verifică dacă Worker-ul e treaz)
    if (url.pathname === "/api/test-alive") {
      return new Response(JSON.stringify({ 
        status: "ALIVE", 
        message: "AION Worker este activ și interceptează traficul!",
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // -> Ruta LOGIN (Rezolvarea erorii 405)
    if (url.pathname === "/login" && method === "POST") {
      try {
        const body = await request.json();
        
        // Aici vom conecta D1 ulterior. Acum simulăm succesul pentru a trece de blocaj.
        // Simulăm un check simplu
        if (body.password === "start" || body.password === "admin") { 
           return new Response(JSON.stringify({ success: true, role: "teacher", name: "Ruslan" }), {
             headers: { ...corsHeaders, "Content-Type": "application/json" }
           });
        } else {
           return new Response(JSON.stringify({ success: false, error: "Parolă incorectă (Simulare)" }), {
             status: 401,
             headers: { ...corsHeaders, "Content-Type": "application/json" }
           });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    // -> Ruta CHAT (Rezolvarea erorii 405)
    if (url.pathname === "/api/chat" && method === "POST") {
      // Aici vom conecta Mistral/DeepSeek. Acum returnăm un ecou.
      return new Response(JSON.stringify({ 
        response: "Conexiune stabilita cu Backend-ul. Eroarea 405 a fost eliminată." 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. FALLBACK CĂTRE ASSETS (Regula de Aur)
    // Dacă cererea NU a fost interceptată mai sus (nu e login, nu e chat),
    // atunci este o cerere pentru HTML/CSS/JS/Imagini. O lăsăm să treacă.
    return env.ASSETS.fetch(request);
  }
};
