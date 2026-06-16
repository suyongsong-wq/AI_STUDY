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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memos (
      id          BIGSERIAL PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  dbInitialized = true;
}

// ======== Middleware ========
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// /api 라우트 진입 전에 DB 초기화 보장
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err.message);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// 클라이언트(index.html)가 기대하는 메모 객체 형태로 변환
// { id, title, content, createdAt, updatedAt }
function toMemo(row) {
  return {
    id: Number(row.id),
    title: row.title,
    content: row.content,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// ======== API Routes ========

// 전체 목록 (최신순)
app.get('/api/memos', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM memos ORDER BY created_at DESC, id DESC'
    );
    res.json({ success: true, data: rows.map(toMemo) });
  } catch (err) {
    console.error('GET /api/memos error:', err.message);
    res.status(500).json({ success: false, message: '메모 목록을 불러오지 못했습니다.' });
  }
});

// 생성
app.post('/api/memos', async (req, res) => {
  try {
    const title = (req.body.title ?? '').toString();
    const content = (req.body.content ?? '').toString();
    if (!title.trim() && !content.trim()) {
      return res.status(400).json({ success: false, message: '제목 또는 내용을 입력하세요.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO memos (title, content) VALUES ($1, $2) RETURNING *',
      [title, content]
    );
    res.status(201).json({ success: true, data: toMemo(rows[0]) });
  } catch (err) {
    console.error('POST /api/memos error:', err.message);
    res.status(500).json({ success: false, message: '메모를 생성하지 못했습니다.' });
  }
});

// 수정
app.put('/api/memos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const title = (req.body.title ?? '').toString();
    const content = (req.body.content ?? '').toString();
    const { rows } = await pool.query(
      'UPDATE memos SET title = $1, content = $2, updated_at = now() WHERE id = $3 RETURNING *',
      [title, content, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '메모를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: toMemo(rows[0]) });
  } catch (err) {
    console.error('PUT /api/memos/:id error:', err.message);
    res.status(500).json({ success: false, message: '메모를 수정하지 못했습니다.' });
  }
});

// 삭제
app.delete('/api/memos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const { rowCount } = await pool.query('DELETE FROM memos WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: '메모를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('DELETE /api/memos/:id error:', err.message);
    res.status(500).json({ success: false, message: '메모를 삭제하지 못했습니다.' });
  }
});

// ======== Startup ========
app.listen(PORT, async () => {
  try {
    await initDB();
    console.log(`Server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error('DB 연결/초기화 실패:', err.message);
    console.error('.env의 DATABASE_URL과 비밀번호를 확인하세요.');
  }
});

module.exports = app;
