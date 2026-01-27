/**
 * ============================================
 * CLOUDFLARE D1 - QUIZ STORAGE & CRUD
 * ============================================
 * 
 * SCOP: Persistență centralizată quizuri în cloud
 * INTEGRARE: mentor-ai-worker.js → saveQuizToD1() → Cloudflare D1 Database
 * 
 * SCHEMA D1 (SQL DDL):
 * 
 * CREATE TABLE quizzes (
 *   id TEXT PRIMARY KEY,              -- UUID generat client-side
 *   student_id TEXT NOT NULL,         -- User ID (din autentificare)
 *   mentor_id TEXT NOT NULL,          -- 'ABSOLVUS' | 'BACUS' | 'OLIMPICUS' | 'CRONICUS'
 *   template_type TEXT NOT NULL,      -- 'CUNOASTERE' | 'INTELEGERE' | 'APLICARE' | 'ANALIZA' | 'SINTEZA'
 *   tema TEXT NOT NULL,               -- ex: 'Revoluția Franceză 1789'
 *   content JSON NOT NULL,            -- Quiz complet (intrebare, variante, raspuns, explicatie)
 *   ai_provider TEXT NOT NULL,        -- 'deepseek' | 'mistral'
 *   ai_model TEXT,                    -- 'deepseek-chat' | 'deepseek-reasoner' | 'mistral-medium'
 *   thinking_process TEXT,            -- DeepSeek-R1 reasoning (dacă există)
 *   limba TEXT DEFAULT 'RO',          -- 'RO' | 'RU'
 *   created_at INTEGER NOT NULL,      -- Unix timestamp (ms)
 *   difficulty TEXT,                  -- 'ușor' | 'mediu' | 'avansat' | 'foarte avansat'
 *   bloom_level INTEGER,              -- 1-5 (conform taxonomiei Bloom)
 *   token_estimate INTEGER,           -- Estimate pentru billing tracking
 *   quiz_status TEXT DEFAULT 'draft', -- 'draft' | 'completed' | 'reviewed'
 *   score INTEGER,                    -- Rezultat obținut (dacă completat)
 *   max_score INTEGER                 -- Punctaj maxim posibil
 * );
 * 
 * CREATE INDEX idx_student_quizzes ON quizzes(student_id, created_at DESC);
 * CREATE INDEX idx_mentor_type ON quizzes(mentor_id, template_type);
 * CREATE INDEX idx_status ON quizzes(quiz_status);
 * 
 * DEPLOYMENT D1:
 * 1. wrangler d1 create history-cosmos-db
 * 2. wrangler d1 execute history-cosmos-db --file=migrations/001_create_quizzes_table.sql
 * 3. Adaugă binding în wrangler.toml:
 *    [[d1_databases]]
 *    binding = "DB"
 *    database_name = "history-cosmos-db"
 *    database_id = "your-db-uuid-here"
 */

// ============================================
// UTILITĂȚI AUXILIARE
// ============================================

/**
 * Generare UUID simplu (compatibil browser + worker)
 */
function generateUUID() {
  return 'quiz-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
}

/**
 * Mapare Template Type → Bloom Level
 */
const BLOOM_MAPPING = {
  'CUNOASTERE': 1,
  'INTELEGERE': 2,
  'APLICARE': 3,
  'ANALIZA': 4,
  'SINTEZA': 5
};

/**
 * Mapare Template Type → Difficulty
 */
const DIFFICULTY_MAPPING = {
  'CUNOASTERE': 'ușor',
  'INTELEGERE': 'mediu',
  'APLICARE': 'mediu',
  'ANALIZA': 'avansat',
  'SINTEZA': 'foarte avansat'
};

// ============================================
// CRUD OPERATIONS (CLOUDFLARE D1)
// ============================================

/**
 * SALVARE QUIZ NOU ÎN D1
 * 
 * @param {object} env - Cloudflare Worker env (conține env.DB binding)
 * @param {object} quizData - Obiect complet quiz generat
 * @returns {Promise<object>} { success: true, quizId: '...' }
 * 
 * EXEMPLU USAGE (în mentor-ai-worker.js):
 * 
 * const quizData = {
 *   studentId: 'user-12345',
 *   mentorId: 'BACUS',
 *   templateType: 'ANALIZA',
 *   tema: 'Revoluția Franceză 1789',
 *   content: { // Quiz complet din AI response
 *     intrebare: '...',
 *     variante: [...],
 *     raspunsCorect: 'A',
 *     explicatie: '...'
 *   },
 *   aiProvider: 'deepseek',
 *   aiModel: 'deepseek-chat',
 *   thinkingProcess: null,
 *   limba: 'RO',
 *   tokenEstimate: 450
 * };
 * 
 * const result = await saveQuizToD1(env, quizData);
 */
async function saveQuizToD1(env, quizData) {
  const quizId = quizData.quizId || generateUUID();
  const timestamp = Date.now();
  
  const bloomLevel = BLOOM_MAPPING[quizData.templateType] || 0;
  const difficulty = DIFFICULTY_MAPPING[quizData.templateType] || 'mediu';
  
  // Serializare JSON pentru content
  const contentJSON = JSON.stringify(quizData.content);
  
  // Prepare SQL statement
  const sql = `
    INSERT INTO quizzes (
      id, student_id, mentor_id, template_type, tema,
      content, ai_provider, ai_model, thinking_process,
      limba, created_at, difficulty, bloom_level,
      token_estimate, quiz_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `;
  
  const params = [
    quizId,
    quizData.studentId,
    quizData.mentorId,
    quizData.templateType,
    quizData.tema,
    contentJSON,
    quizData.aiProvider,
    quizData.aiModel,
    quizData.thinkingProcess || null,
    quizData.limba || 'RO',
    timestamp,
    difficulty,
    bloomLevel,
    quizData.tokenEstimate || 0
  ];
  
  try {
    await env.DB.prepare(sql).bind(...params).run();
    
    return {
      success: true,
      quizId: quizId,
      timestamp: timestamp
    };
    
  } catch (error) {
    console.error('❌ D1 Save Error:', error);
    throw new Error(`Failed to save quiz to D1: ${error.message}`);
  }
}

/**
 * ACTUALIZARE SCOR QUIZ (după completare student)
 * 
 * @param {object} env - Cloudflare Worker env
 * @param {string} quizId - UUID quiz
 * @param {number} score - Punctaj obținut
 * @param {number} maxScore - Punctaj maxim
 * @returns {Promise<object>} { success: true }
 */
async function updateQuizScore(env, quizId, score, maxScore) {
  const sql = `
    UPDATE quizzes 
    SET score = ?, max_score = ?, quiz_status = 'completed'
    WHERE id = ?
  `;
  
  try {
    await env.DB.prepare(sql).bind(score, maxScore, quizId).run();
    
    return {
      success: true,
      quizId: quizId,
      score: score,
      maxScore: maxScore,
      percentage: Math.round((score / maxScore) * 100)
    };
    
  } catch (error) {
    console.error('❌ D1 Update Score Error:', error);
    throw new Error(`Failed to update quiz score: ${error.message}`);
  }
}

/**
 * PRELUARE ISTORIC QUIZURI STUDENT (paginat)
 * 
 * @param {object} env - Cloudflare Worker env
 * @param {string} studentId - User ID
 * @param {number} limit - Număr maxim rezultate (default: 20)
 * @param {number} offset - Offset pentru paginare (default: 0)
 * @returns {Promise<array>} Lista quizuri
 */
async function getStudentQuizHistory(env, studentId, limit = 20, offset = 0) {
  const sql = `
    SELECT 
      id, mentor_id, template_type, tema, limba,
      created_at, difficulty, bloom_level, quiz_status,
      score, max_score, token_estimate
    FROM quizzes
    WHERE student_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  
  try {
    const result = await env.DB.prepare(sql).bind(studentId, limit, offset).all();
    
    // Transform created_at (unix ms) to human-readable
    const quizzes = result.results.map(quiz => ({
      ...quiz,
      created_at_date: new Date(quiz.created_at).toISOString(),
      score_percentage: quiz.max_score 
        ? Math.round((quiz.score / quiz.max_score) * 100) 
        : null
    }));
    
    return quizzes;
    
  } catch (error) {
    console.error('❌ D1 Fetch History Error:', error);
    throw new Error(`Failed to fetch quiz history: ${error.message}`);
  }
}

/**
 * PRELUARE DETALII QUIZ COMPLET (cu content JSON)
 * 
 * @param {object} env - Cloudflare Worker env
 * @param {string} quizId - UUID quiz
 * @returns {Promise<object>} Quiz complet sau null dacă nu există
 */
async function getQuizById(env, quizId) {
  const sql = `
    SELECT * FROM quizzes WHERE id = ?
  `;
  
  try {
    const result = await env.DB.prepare(sql).bind(quizId).first();
    
    if (!result) {
      return null;
    }
    
    // Parse JSON content
    result.content = JSON.parse(result.content);
    result.created_at_date = new Date(result.created_at).toISOString();
    
    return result;
    
  } catch (error) {
    console.error('❌ D1 Fetch Quiz Error:', error);
    throw new Error(`Failed to fetch quiz by ID: ${error.message}`);
  }
}

/**
 * STATISTICI STUDENT (rezumat performanță)
 * 
 * @param {object} env - Cloudflare Worker env
 * @param {string} studentId - User ID
 * @returns {Promise<object>} Statistici: total, completed, avg_score, etc.
 */
async function getStudentStats(env, studentId) {
  const sql = `
    SELECT 
      COUNT(*) as total_quizzes,
      COUNT(CASE WHEN quiz_status = 'completed' THEN 1 END) as completed_quizzes,
      AVG(CASE WHEN score IS NOT NULL THEN score * 100.0 / max_score END) as avg_score_pct,
      SUM(token_estimate) as total_tokens_used
    FROM quizzes
    WHERE student_id = ?
  `;
  
  try {
    const result = await env.DB.prepare(sql).bind(studentId).first();
    
    return {
      totalQuizzes: result.total_quizzes || 0,
      completedQuizzes: result.completed_quizzes || 0,
      avgScorePercentage: result.avg_score_pct ? Math.round(result.avg_score_pct) : null,
      totalTokensUsed: result.total_tokens_used || 0
    };
    
  } catch (error) {
    console.error('❌ D1 Stats Error:', error);
    throw new Error(`Failed to fetch student stats: ${error.message}`);
  }
}

/**
 * ȘTERGERE QUIZ (soft delete prin status 'deleted')
 * 
 * @param {object} env - Cloudflare Worker env
 * @param {string} quizId - UUID quiz
 * @param {string} studentId - User ID (verificare ownership)
 * @returns {Promise<object>} { success: true }
 */
async function deleteQuiz(env, quizId, studentId) {
  // Verificare ownership
  const checkSql = `SELECT student_id FROM quizzes WHERE id = ?`;
  const check = await env.DB.prepare(checkSql).bind(quizId).first();
  
  if (!check || check.student_id !== studentId) {
    throw new Error('Quiz not found or unauthorized');
  }
  
  // Soft delete
  const deleteSql = `UPDATE quizzes SET quiz_status = 'deleted' WHERE id = ?`;
  
  try {
    await env.DB.prepare(deleteSql).bind(quizId).run();
    
    return {
      success: true,
      quizId: quizId
    };
    
  } catch (error) {
    console.error('❌ D1 Delete Error:', error);
    throw new Error(`Failed to delete quiz: ${error.message}`);
  }
}

// ============================================
// EXPORT MODUL
// ============================================

export {
  generateUUID,
  saveQuizToD1,
  updateQuizScore,
  getStudentQuizHistory,
  getQuizById,
  getStudentStats,
  deleteQuiz
};
