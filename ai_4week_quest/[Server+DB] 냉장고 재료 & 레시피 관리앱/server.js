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
  // 레시피 테이블: 직접 작성한 레시피 (요리명 + 재료 + 조리법)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id          BIGSERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      ingredients TEXT NOT NULL DEFAULT '',
      steps       TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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
    if (!title) {
      return res.status(400).json({ success: false, message: '요리명을 입력하세요.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO recipes (title, ingredients, steps) VALUES ($1, $2, $3) RETURNING *',
      [title, ingredients, steps]
    );
    res.status(201).json({ success: true, data: toRecipe(rows[0]) });
  } catch (err) {
    console.error('POST /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: '레시피를 저장하지 못했습니다.' });
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
