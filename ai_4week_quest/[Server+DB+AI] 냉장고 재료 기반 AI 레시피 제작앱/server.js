require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ======== Database (Supabase PostgreSQL) ========
// 연결 문자열은 .env의 DATABASE_URL에서 읽습니다. 비밀번호를 코드에 하드코딩하지 마세요.
// Supabase pooler 연결이므로 SSL 설정이 필요합니다.
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// 서버 시작 시 한 번만 테이블을 생성하도록 flag로 중복 실행 방지
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  // 재료 테이블: 냉장고에 있는 재료 (이름 + 카테고리 + 유통기한)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id          BIGSERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT '',
      expiry_date DATE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // 기존 테이블에 expiry_date 컬럼이 없으면 추가 (이미 만든 DB도 호환)
  await pool.query(`ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS expiry_date DATE;`);
  // 레시피 테이블: 직접 작성 + AI 생성 레시피 (요리명 + 재료 + 조리법 + 조리시간/난이도/출처)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id          BIGSERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      ingredients TEXT NOT NULL DEFAULT '',
      steps       TEXT NOT NULL DEFAULT '',
      cook_time   TEXT NOT NULL DEFAULT '',
      difficulty  TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL DEFAULT 'manual',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // 기존 recipes 테이블에 새 컬럼이 없으면 추가 (이전 퀘스트 DB도 호환)
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cook_time  TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'manual';`);
  dbInitialized = true;
}

// ======== Middleware ========
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// /api 라우트 진입 전에 DB 초기화 보장 (테이블이 없으면 만들어 둠)
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err.message);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// DATE 컬럼을 'YYYY-MM-DD' 문자열로 (시간대 밀림 없이 로컬 기준)
function ymd(d) {
  if (!d) return null;
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 클라이언트가 기대하는 형태로 변환 (created_at → createdAt: epoch ms)
function toIngredient(row) {
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category,
    expiryDate: ymd(row.expiry_date), // 유통기한 (없으면 null)
    createdAt: new Date(row.created_at).getTime(),
  };
}

function toRecipe(row) {
  return {
    id: Number(row.id),
    title: row.title,
    ingredients: row.ingredients,
    steps: row.steps,
    cookTime: row.cook_time || '',     // 예상 조리시간
    difficulty: row.difficulty || '',  // 난이도
    source: row.source || 'manual',    // 'manual'(직접 작성) | 'ai'(AI 생성)
    createdAt: new Date(row.created_at).getTime(),
  };
}

// ======== 재료(ingredients) API ========

// 재료 전체 목록 (최신순)
app.get('/api/ingredients', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ingredients ORDER BY created_at DESC, id DESC'
    );
    res.json({ success: true, data: rows.map(toIngredient) });
  } catch (err) {
    console.error('GET /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: '재료 목록을 불러오지 못했습니다.' });
  }
});

// 재료 등록
app.post('/api/ingredients', async (req, res) => {
  try {
    const name = (req.body.name ?? '').toString().trim();
    const category = (req.body.category ?? '').toString().trim();
    // 유통기한: 'YYYY-MM-DD' 문자열 또는 빈 값(null)
    const expiryDate = (req.body.expiryDate ?? '').toString().trim() || null;
    if (!name) {
      return res.status(400).json({ success: false, message: '재료 이름을 입력하세요.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO ingredients (name, category, expiry_date) VALUES ($1, $2, $3) RETURNING *',
      [name, category, expiryDate]
    );
    res.status(201).json({ success: true, data: toIngredient(rows[0]) });
  } catch (err) {
    console.error('POST /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: '재료를 등록하지 못했습니다.' });
  }
});

// 재료 삭제
app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const { rowCount } = await pool.query('DELETE FROM ingredients WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: '재료를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('DELETE /api/ingredients/:id error:', err.message);
    res.status(500).json({ success: false, message: '재료를 삭제하지 못했습니다.' });
  }
});

// ======== 레시피(recipes) API ========

// 레시피 전체 목록 (최신순)
app.get('/api/recipes', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM recipes ORDER BY created_at DESC, id DESC'
    );
    res.json({ success: true, data: rows.map(toRecipe) });
  } catch (err) {
    console.error('GET /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: '레시피 목록을 불러오지 못했습니다.' });
  }
});

// 레시피 작성
app.post('/api/recipes', async (req, res) => {
  try {
    const title = (req.body.title ?? '').toString().trim();
    const ingredients = (req.body.ingredients ?? '').toString();
    const steps = (req.body.steps ?? '').toString();
    const cookTime = (req.body.cookTime ?? '').toString();
    const difficulty = (req.body.difficulty ?? '').toString();
    // source는 'ai' 또는 'manual'만 허용
    const source = (req.body.source === 'ai') ? 'ai' : 'manual';
    if (!title) {
      return res.status(400).json({ success: false, message: '요리명을 입력하세요.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO recipes (title, ingredients, steps, cook_time, difficulty, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, ingredients, steps, cookTime, difficulty, source]
    );
    res.status(201).json({ success: true, data: toRecipe(rows[0]) });
  } catch (err) {
    console.error('POST /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: '레시피를 저장하지 못했습니다.' });
  }
});

// ======== AI 레시피 생성 (Google Gemini, 무료 API) ========
// 흐름: DB에서 재료 조회 → 프롬프트 구성 → Gemini 호출 → JSON 레시피 반환(아직 저장 X)
//      사용자가 마음에 들면 POST /api/recipes로 저장(source: 'ai')

// 모드별 추가 지시 (간단요리 / 다이어트 / 야식 등)
const MODE_PROMPTS = {
  '간단요리': '재료와 조리 단계를 최소화한 15분 이내의 아주 간단한 요리로 만들어줘.',
  '다이어트': '기름과 탄수화물을 줄이고 칼로리가 낮은 건강한 다이어트 요리로 만들어줘.',
  '야식':     '맵거나 짭짤하고 든든한, 밤에 먹기 좋은 야식 요리로 만들어줘.',
  '푸짐한':   '여러 재료를 활용한 푸짐하고 든든한 한 상 요리로 만들어줘.',
};

// Gemini API 호출 (REST, Node 18+ 내장 fetch 사용 — 별도 패키지 불필요)
async function callGemini(prompt) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. .env에 키를 넣어주세요.');
  }
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      // 구조화된 JSON으로 받아서 파싱을 안정화
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title:       { type: 'STRING' },
          ingredients: { type: 'STRING' },
          steps:       { type: 'STRING' },
          cookTime:    { type: 'STRING' },
          difficulty:  { type: 'STRING' },
        },
        required: ['title', 'ingredients', 'steps', 'cookTime', 'difficulty'],
      },
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Gemini API error:', resp.status, errText);
    if (resp.status === 400 || resp.status === 403) {
      throw new Error('Gemini API 키가 잘못되었거나 권한이 없습니다. .env의 GEMINI_API_KEY를 확인하세요.');
    }
    if (resp.status === 429) {
      throw new Error('Gemini 무료 사용량 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
    }
    throw new Error('AI 호출에 실패했습니다. 잠시 후 다시 시도하세요.');
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI가 빈 응답을 보냈습니다. 다시 시도하세요.');
  return JSON.parse(text);
}

// AI 레시피 생성
app.post('/api/recipes/generate', async (req, res) => {
  try {
    const mode = (req.body.mode ?? '').toString().trim();

    // 1) DB에서 현재 냉장고 재료 조회
    const { rows } = await pool.query('SELECT name, category FROM ingredients ORDER BY id');
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: '냉장고에 재료가 없습니다. 먼저 재료를 등록하세요.' });
    }
    const ingredientList = rows.map(r => r.name).join(', ');

    // 2) 프롬프트 구성
    const modeInstruction = MODE_PROMPTS[mode] || '집에서 만들기 좋은 무난한 요리로 만들어줘.';
    const prompt = [
      '너는 한국어로 답하는 요리 전문가야.',
      `다음은 우리집 냉장고에 있는 재료 목록이야: ${ingredientList}.`,
      '이 재료들을 활용해서 만들 수 있는 요리 레시피를 1개 추천해줘.',
      modeInstruction,
      '냉장고에 없는 재료는 가능하면 쓰지 말고, 꼭 필요한 기본 양념 정도만 추가해.',
      '응답 형식:',
      '- title: 요리 이름',
      '- ingredients: 재료를 쉼표로 구분한 한 줄',
      '- steps: 조리법을 한 줄에 한 단계씩(1. 2. 3. ...), 줄바꿈으로 구분',
      '- cookTime: 예상 조리시간 (예: "약 20분")',
      '- difficulty: 난이도 ("쉬움", "보통", "어려움" 중 하나)',
    ].join('\n');

    // 3) Gemini 호출
    const draft = await callGemini(prompt);

    // 4) 생성된 레시피(초안) 반환 — 저장은 사용자가 선택
    res.json({
      success: true,
      data: {
        title: (draft.title || '').toString(),
        ingredients: (draft.ingredients || '').toString(),
        steps: (draft.steps || '').toString(),
        cookTime: (draft.cookTime || '').toString(),
        difficulty: (draft.difficulty || '').toString(),
        source: 'ai',
        usedIngredients: ingredientList,
        mode: mode || '추천',
      },
    });
  } catch (err) {
    console.error('POST /api/recipes/generate error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'AI 레시피 생성에 실패했습니다.' });
  }
});

// 레시피 삭제
app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const { rowCount } = await pool.query('DELETE FROM recipes WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: '레시피를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('DELETE /api/recipes/:id error:', err.message);
    res.status(500).json({ success: false, message: '레시피를 삭제하지 못했습니다.' });
  }
});

// ======== Startup ========
// 로컬에서는 직접 실행, Vercel에서는 module.exports로 동작
if (require.main === module) {
  app.listen(PORT, async () => {
    try {
      await initDB();
      console.log(`Server running on http://localhost:${PORT}`);
    } catch (err) {
      console.error('DB 연결/초기화 실패:', err.message);
      console.error('.env의 DATABASE_URL과 비밀번호를 확인하세요.');
    }
  });
}

module.exports = app;
