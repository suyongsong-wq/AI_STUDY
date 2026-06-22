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

// 밸런스 게임 시드 질문 (돈/직장 테마 — 4주차 주제와 매칭)
// questions 테이블이 비어 있을 때 한 번만 들어갑니다.
const SEED_QUESTIONS = [
  ['월급 500 + 주7일 출근', '월급 300 + 주4일 출근'],
  ['월세 50만원 깨끗한 신축', '전세 대출 끼고 낡은 내 집'],
  ['매일 카페에서 커피 사먹기', '회사 탕비실 믹스커피'],
  ['로또 1등 당첨금 한 번에', '매달 평생 200만원씩'],
  ['점심값 아껴서 저축', '맛있는 점심 먹고 행복'],
  ['연봉 높은데 야근 많은 회사', '연봉 적당하고 칼퇴 회사'],
];

// 서버 시작 시 한 번만 테이블을 생성하도록 flag로 중복 실행 방지
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;

  // 질문 테이블: 밸런스 게임의 A vs B 선택지
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id         BIGSERIAL PRIMARY KEY,
      option_a   TEXT NOT NULL,
      option_b   TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // 투표 테이블: 질문 하나에 투표가 여러 개 쌓임 (1:N).
  //  - choice 는 반드시 'A' 또는 'B' (CHECK 제약으로 강제)
  //  - 질문이 삭제되면 투표도 함께 삭제 (ON DELETE CASCADE)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id          BIGSERIAL PRIMARY KEY,
      question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      choice      TEXT NOT NULL CHECK (choice IN ('A', 'B')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // 질문이 하나도 없을 때만 시드 질문을 넣어둠 (수업 시작 시 바로 투표 가능)
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM questions');
  if (rows[0].n === 0) {
    for (const [a, b] of SEED_QUESTIONS) {
      await pool.query('INSERT INTO questions (option_a, option_b) VALUES ($1, $2)', [a, b]);
    }
    console.log(`시드 질문 ${SEED_QUESTIONS.length}개를 등록했습니다.`);
  }

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

// 집계 행(row)을 클라이언트가 기대하는 질문 객체로 변환.
// 투표율 계산: A/B 투표 수의 비율 (percentA + percentB === 100 보장)
function toQuestion(row) {
  const votesA = Number(row.votes_a ?? 0);
  const votesB = Number(row.votes_b ?? 0);
  const total = votesA + votesB;
  const percentA = total ? Math.round((votesA / total) * 100) : 0;
  const percentB = total ? 100 - percentA : 0;
  return {
    id: Number(row.id),
    optionA: row.option_a,
    optionB: row.option_b,
    votesA,
    votesB,
    total,
    percentA,
    percentB,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// 질문 + A/B 투표수 집계를 한 번에 가져오는 공통 쿼리.
// whereId 가 주어지면 특정 질문 하나만, 아니면 전체(최신순).
async function fetchQuestions(whereId) {
  const where = whereId ? 'WHERE q.id = $1' : '';
  const params = whereId ? [whereId] : [];
  const { rows } = await pool.query(
    `
    SELECT q.id, q.option_a, q.option_b, q.created_at,
           COUNT(v.id) FILTER (WHERE v.choice = 'A') AS votes_a,
           COUNT(v.id) FILTER (WHERE v.choice = 'B') AS votes_b
    FROM questions q
    LEFT JOIN votes v ON v.question_id = q.id
    ${where}
    GROUP BY q.id
    ORDER BY q.created_at DESC, q.id DESC
    `,
    params
  );
  return rows.map(toQuestion);
}

// ======== 질문(questions) API ========

// 질문 목록 + 실시간 투표 집계 (최신순)
app.get('/api/questions', async (_req, res) => {
  try {
    const data = await fetchQuestions();
    res.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/questions error:', err.message);
    res.status(500).json({ success: false, message: '질문 목록을 불러오지 못했습니다.' });
  }
});

// 질문 등록 (A vs B)
app.post('/api/questions', async (req, res) => {
  try {
    const optionA = (req.body.optionA ?? '').toString().trim();
    const optionB = (req.body.optionB ?? '').toString().trim();
    if (!optionA || !optionB) {
      return res.status(400).json({ success: false, message: 'A와 B 두 선택지를 모두 입력하세요.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO questions (option_a, option_b) VALUES ($1, $2) RETURNING id',
      [optionA, optionB]
    );
    // 방금 만든 질문을 집계 형태(투표 0)로 다시 조회해서 반환
    const [created] = await fetchQuestions(rows[0].id);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('POST /api/questions error:', err.message);
    res.status(500).json({ success: false, message: '질문을 등록하지 못했습니다.' });
  }
});

// 투표 (핵심: votes 테이블에 INSERT → 실시간 집계 반환)
app.post('/api/questions/:id/vote', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const choice = (req.body.choice ?? '').toString().trim().toUpperCase();
    if (choice !== 'A' && choice !== 'B') {
      return res.status(400).json({ success: false, message: '선택은 A 또는 B 여야 합니다.' });
    }
    // 부모 질문이 있어야 투표 가능 (FK가 막아주지만 친절한 메시지를 위해 선확인)
    const parent = await pool.query('SELECT id FROM questions WHERE id = $1', [id]);
    if (parent.rows.length === 0) {
      return res.status(404).json({ success: false, message: '질문을 찾을 수 없습니다.' });
    }
    await pool.query('INSERT INTO votes (question_id, choice) VALUES ($1, $2)', [id, choice]);
    // 투표 직후 갱신된 집계를 돌려줘서 화면이 바로 퍼센티지를 반영하도록 함
    const [updated] = await fetchQuestions(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('POST /api/questions/:id/vote error:', err.message);
    res.status(500).json({ success: false, message: '투표를 반영하지 못했습니다.' });
  }
});

// 질문 삭제 (투표는 CASCADE로 함께 삭제됨)
app.delete('/api/questions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 id입니다.' });
    }
    const { rowCount } = await pool.query('DELETE FROM questions WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: '질문을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('DELETE /api/questions/:id error:', err.message);
    res.status(500).json({ success: false, message: '질문을 삭제하지 못했습니다.' });
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
