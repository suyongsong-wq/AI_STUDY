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
  // 게시글 테이블: 익명 고민/칭찬/응원 글
  //  - likes : ❤️ 공감 수 (공감순 정렬 기준)
  //  - hug   : 🤗 위로 리액션 수
  //  - cheer : 🔥 응원 리액션 수
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id         BIGSERIAL PRIMARY KEY,
      category   TEXT NOT NULL,
      content    TEXT NOT NULL,
      likes      INTEGER NOT NULL DEFAULT 0,
      hug        INTEGER NOT NULL DEFAULT 0,
      cheer      INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // 기존에 posts만 있던 DB도 호환되도록 리액션 컬럼을 나중에 추가
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS hug   INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS cheer INTEGER NOT NULL DEFAULT 0;`);
  // 답글(댓글) 테이블: 글 하나에 익명 답글이 여러 개 달림 (1:N 관계)
  // 글이 삭제되면 답글도 함께 삭제 (ON DELETE CASCADE)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id         BIGSERIAL PRIMARY KEY,
      post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

// 허용 카테고리 (서버에서 검증)
const CATEGORIES = ['고민', '칭찬', '응원'];
// 리액션 종류 → 실제 컬럼명 (화이트리스트: SQL 인젝션 방지용)
const REACTIONS = { likes: 'likes', hug: 'hug', cheer: 'cheer' };

// 클라이언트가 기대하는 형태로 변환 (created_at → createdAt: epoch ms)
function toPost(row) {
  return {
    id: Number(row.id),
    category: row.category,
    content: row.content,
    likes: Number(row.likes),
    hug: Number(row.hug),
    cheer: Number(row.cheer),
    commentCount: Number(row.comment_count ?? 0),
    createdAt: new Date(row.created_at).getTime(),
  };
}

function toComment(row) {
  return {
    id: Number(row.id),
    postId: Number(row.post_id),
    content: row.content,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// ======== 게시글(posts) API ========

// 게시글 목록 (sort=likes → 공감순, 그 외 → 최신순) + 답글 수 함께 조회
app.get('/api/posts', async (req, res) => {
  try {
    // 공감순: likes 내림차순(동률이면 최신순), 기본: 최신순
    const orderBy = req.query.sort === 'likes'
      ? 'p.likes DESC, p.created_at DESC, p.id DESC'
      : 'p.created_at DESC, p.id DESC';
    // 글마다 답글 개수를 서브쿼리로 함께 가져옴
    const { rows } = await pool.query(`
      SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
      FROM posts p
      ORDER BY ${orderBy}
    `);
    res.json({ success: true, data: rows.map(toPost) });
  } catch (err) {
    console.error('GET /api/posts error:', err.message);
    res.status(500).json({ success: false, message: '게시글 목록을 불러오지 못했습니다.' });
  }
});

// 게시글 작성 (익명)
app.post('/api/posts', async (req, res) => {
  try {
    const category = (req.body.category ?? '').toString().trim();
    const content = (req.body.content ?? '').toString().trim();
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: '카테고리는 고민/칭찬/응원 중 하나여야 합니다.' });
    }
    if (!content) {
      return res.status(400).json({ success: false, message: '내용을 입력하세요.' });
    }
    // likes/hug/cheer는 DEFAULT 0으로 시작
    const { rows } = await pool.query(
      'INSERT INTO posts (category, content) VALUES ($1, $2) RETURNING *',
      [category, content]
    );
    res.status(201).json({ success: true, data: toPost(rows[0]) });
  } catch (err) {
    console.error('POST /api/posts error:', err.message);
    res.status(500).json({ success: false, message: '게시글을 등록하지 못했습니다.' });
  }
});

// 공감 버튼 (핵심: DB UPDATE — likes를 +1)
app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const { rows } = await pool.query(
      'UPDATE posts SET likes = likes + 1 WHERE id = $1 RETURNING *',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: toPost(rows[0]) });
  } catch (err) {
    console.error('POST /api/posts/:id/like error:', err.message);
    res.status(500).json({ success: false, message: '공감을 반영하지 못했습니다.' });
  }
});

// 감정 리액션 버튼 (likes/hug/cheer 중 하나를 +1) — 다중 리액션용 일반 엔드포인트
app.post('/api/posts/:id/react', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    // 화이트리스트로 컬럼명을 확정 (사용자 입력을 SQL에 직접 넣지 않음)
    const column = REACTIONS[(req.body.type ?? '').toString()];
    if (!column) {
      return res.status(400).json({ success: false, message: '리액션 종류가 올바르지 않습니다.' });
    }
    const { rows } = await pool.query(
      `UPDATE posts SET ${column} = ${column} + 1 WHERE id = $1 RETURNING *`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: toPost(rows[0]) });
  } catch (err) {
    console.error('POST /api/posts/:id/react error:', err.message);
    res.status(500).json({ success: false, message: '리액션을 반영하지 못했습니다.' });
  }
});

// 게시글 삭제 (답글은 CASCADE로 함께 삭제됨)
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const { rowCount } = await pool.query('DELETE FROM posts WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('DELETE /api/posts/:id error:', err.message);
    res.status(500).json({ success: false, message: '게시글을 삭제하지 못했습니다.' });
  }
});

// ======== 답글(comments) API ========

// 특정 글의 답글 목록 (오래된 순 — 대화 흐름대로)
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC, id ASC',
      [postId]
    );
    res.json({ success: true, data: rows.map(toComment) });
  } catch (err) {
    console.error('GET /api/posts/:id/comments error:', err.message);
    res.status(500).json({ success: false, message: '답글을 불러오지 못했습니다.' });
  }
});

// 답글 작성 (익명)
app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const content = (req.body.content ?? '').toString().trim();
    if (!content) {
      return res.status(400).json({ success: false, message: '답글 내용을 입력하세요.' });
    }
    // 부모 글이 있어야 답글을 달 수 있음 (FK가 막아주지만 친절한 메시지를 위해 선확인)
    const parent = await pool.query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (parent.rows.length === 0) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO comments (post_id, content) VALUES ($1, $2) RETURNING *',
      [postId, content]
    );
    res.status(201).json({ success: true, data: toComment(rows[0]) });
  } catch (err) {
    console.error('POST /api/posts/:id/comments error:', err.message);
    res.status(500).json({ success: false, message: '답글을 등록하지 못했습니다.' });
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
