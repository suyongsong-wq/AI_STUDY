// server.js — 가계부 DB 분석 에이전트 백엔드 (Express + pg, Local/Vercel dual-mode)
// ※ 1번 가계부 앱과 "같은 Supabase DB / 같은 테이블(household_ledger)"을 읽기 전용으로 분석한다.
//   INSERT / UPDATE / DELETE / DROP 절대 없음 — 오직 SELECT 집계만 수행한다.
require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// DB Pool (1번 가계부와 동일한 Supabase Postgres — DATABASE_URL 공유)
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Lazy DB init (cold start 대응)
// 분석 레이어이므로 테이블이 없을 경우를 대비한 CREATE TABLE IF NOT EXISTS만 둔다.
// 이미 1번 가계부가 만든 테이블/데이터가 있으면 그대로 보존된다 (DROP/INSERT 금지).
// ---------------------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS household_ledger (
      id         SERIAL PRIMARY KEY,
      type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      category   TEXT NOT NULL,
      amount     NUMERIC NOT NULL,
      memo       TEXT DEFAULT '',
      date       DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  dbInitialized = true;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(__dirname));

// 모든 /api 요청 전에 DB 초기화 보장
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// ---------------------------------------------------------------------------
// 공용 유틸
// ---------------------------------------------------------------------------
const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토']; // EXTRACT(DOW): 0=일 .. 6=토

function won(n) {
  return Number(n).toLocaleString('ko-KR') + '원';
}

// 분석에 필요한 모든 집계를 한 번에 계산 (읽기 전용 SELECT만 사용)
async function computeStats() {
  const [totals, byCategoryRes, byWeekdayRes, dailyRes, countRes] = await Promise.all([
    // 전체 수입/지출 합계
    pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)::bigint AS income,
        COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::bigint AS expense
      FROM household_ledger
    `),
    // 지출 카테고리별 합계 (DESC)
    pool.query(`
      SELECT category, SUM(amount)::bigint AS total
      FROM household_ledger
      WHERE type = 'expense'
      GROUP BY category
      ORDER BY total DESC
    `),
    // 요일별 지출 합계 (0=일 .. 6=토)
    pool.query(`
      SELECT EXTRACT(DOW FROM date)::int AS dow, SUM(amount)::bigint AS total
      FROM household_ledger
      WHERE type = 'expense'
      GROUP BY dow
      ORDER BY dow
    `),
    // 일자별 지출 추이
    pool.query(`
      SELECT to_char(date, 'YYYY-MM-DD') AS date, SUM(amount)::bigint AS total
      FROM household_ledger
      WHERE type = 'expense'
      GROUP BY date
      ORDER BY date
    `),
    // 전체 거래 건수
    pool.query(`SELECT COUNT(*)::int AS count FROM household_ledger`),
  ]);

  const income = Number(totals.rows[0].income);
  const expense = Number(totals.rows[0].expense);

  const byCategory = byCategoryRes.rows.map((r) => ({
    category: r.category,
    total: Number(r.total),
  }));

  const byWeekday = byWeekdayRes.rows.map((r) => ({
    weekday: WEEKDAY_KR[r.dow],
    dow: r.dow,
    total: Number(r.total),
  }));

  const dailyTrend = dailyRes.rows.map((r) => ({
    date: r.date,
    total: Number(r.total),
  }));

  const topCategory = byCategory.length > 0 ? byCategory[0] : null;

  return {
    income,
    expense,
    balance: income - expense,
    byCategory,
    byWeekday,
    dailyTrend,
    topCategory,
    count: Number(countRes.rows[0].count),
  };
}

// ---------------------------------------------------------------------------
// API Routes (전부 읽기 전용 분석)
// ---------------------------------------------------------------------------

// 종합 통계
app.get('/api/stats', async (_req, res) => {
  try {
    const stats = await computeStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('GET /api/stats error:', err);
    res.status(500).json({ success: false, message: '통계 분석에 실패했습니다.' });
  }
});

// 자연어 질문 → 규칙기반(LLM 미사용) 의도 매칭 답변
app.post('/api/ask', async (req, res) => {
  try {
    const question = String((req.body && req.body.question) || '').trim();
    if (!question) {
      return res.status(400).json({ success: false, message: 'question은 필수입니다.' });
    }

    const stats = await computeStats();
    const q = question.toLowerCase();
    const has = (...kws) => kws.some((k) => q.includes(k));

    // 데이터가 전혀 없는 경우
    if (stats.count === 0) {
      return res.json({
        success: true,
        data: {
          answer: '아직 가계부에 기록된 거래가 없어요. 1번 가계부 앱에서 내역을 추가하면 바로 분석해 드릴게요.',
          detail: stats,
        },
      });
    }

    const summarySentence =
      `지금까지 총 수입 ${won(stats.income)}, 총 지출 ${won(stats.expense)}로 ` +
      `잔액은 ${won(stats.balance)}예요. (거래 ${stats.count}건)`;

    let answer;
    let detail;

    // 1) 절약 / 줄이기 조언  ─ 지출 상위 카테고리를 근거로
    if (has('절약', '줄', '아끼', '아낄')) {
      const top2 = stats.byCategory.slice(0, 2);
      detail = top2;
      if (top2.length === 0) {
        answer = '지출 내역이 없어 절약 포인트를 찾지 못했어요.';
      } else if (top2.length === 1) {
        const r = ((top2[0].total / stats.expense) * 100).toFixed(1);
        answer =
          `지출이 '${top2[0].category}'(${won(top2[0].total)}, 전체의 ${r}%)에 집중돼 있어요. ` +
          `이 항목을 조금만 줄여도 절약 효과가 가장 클 거예요.`;
      } else {
        const r0 = ((top2[0].total / stats.expense) * 100).toFixed(1);
        const r1 = ((top2[1].total / stats.expense) * 100).toFixed(1);
        answer =
          `절약하려면 지출 1위 '${top2[0].category}'(${won(top2[0].total)}, ${r0}%)와 ` +
          `2위 '${top2[1].category}'(${won(top2[1].total)}, ${r1}%)부터 점검해 보세요. ` +
          `이 두 항목이 전체 지출의 ${(Number(r0) + Number(r1)).toFixed(1)}%를 차지해요.`;
      }
    }

    // 2) 예산 / 남은 금액
    else if (has('예산', '남은', '남았')) {
      detail = { income: stats.income, expense: stats.expense, balance: stats.balance };
      answer =
        stats.balance >= 0
          ? `총 수입 ${won(stats.income)}에서 지출 ${won(stats.expense)}를 쓰고 ${won(stats.balance)}가 남았어요.`
          : `총 수입 ${won(stats.income)}보다 지출 ${won(stats.expense)}가 더 많아 ${won(Math.abs(stats.balance))} 적자 상태예요.`;
    }

    // 3) 주중 vs 주말 지출 비교
    else if (has('주중', '주말', '평일', '요일')) {
      const weekend = stats.byWeekday
        .filter((w) => w.dow === 0 || w.dow === 6)
        .reduce((s, w) => s + w.total, 0);
      const weekday = stats.byWeekday
        .filter((w) => w.dow >= 1 && w.dow <= 5)
        .reduce((s, w) => s + w.total, 0);
      detail = { weekday, weekend, byWeekday: stats.byWeekday };
      const more = weekday >= weekend ? '주중' : '주말';
      answer =
        `주중(월~금) 지출은 ${won(weekday)}, 주말(토·일) 지출은 ${won(weekend)}예요. ` +
        `${more}에 더 많이 쓰고 있네요.`;
    }

    // 4) 카테고리 / 비율 / 많이 ─ 지출 TOP3 + 비율
    else if (has('카테고리', '비율', '많이', '항목', '어디')) {
      const top3 = stats.byCategory.slice(0, 3);
      detail = top3;
      if (top3.length === 0) {
        answer = '지출 내역이 없어 카테고리 분석을 할 수 없어요.';
      } else {
        const parts = top3.map((c, i) => {
          const r = ((c.total / stats.expense) * 100).toFixed(1);
          return `${i + 1}위 ${c.category} ${won(c.total)}(${r}%)`;
        });
        answer = `지출이 가장 많은 카테고리는 ${parts.join(', ')} 순이에요.`;
      }
    }

    // 5) 이번 달 / 얼마 ─ 총 지출·수입·잔액 요약
    else if (has('이번 달', '이번달', '얼마', '총', '수입', '지출', '잔액')) {
      detail = { income: stats.income, expense: stats.expense, balance: stats.balance };
      answer = summarySentence;
    }

    // 6) 그 외 ─ 요약 + 질문 예시 안내
    else {
      detail = stats;
      answer =
        `${summarySentence}\n` +
        `이렇게 물어보세요 — "이번 달 얼마 썼어?", "어떤 카테고리에 많이 썼어?", ` +
        `"주중이랑 주말 중 언제 더 써?", "어디서 절약할 수 있어?", "예산 얼마 남았어?"`;
    }

    res.json({ success: true, data: { answer, detail } });
  } catch (err) {
    console.error('POST /api/ask error:', err);
    res.status(500).json({ success: false, message: '질문 분석에 실패했습니다.' });
  }
});

// ---------------------------------------------------------------------------
// SPA fallback (Express 4 — 1번 가계부와 동일 버전)
// ---------------------------------------------------------------------------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------------------------------------------------------
// Local: start server / Vercel: export app
// ---------------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
