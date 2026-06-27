// server.js — 가계부 앱 백엔드 (Express + pg, Local/Vercel dual-mode)
require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// DB Pool (Supabase 등 외부 Postgres)
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Lazy DB init (cold start 대응) — 이미 테이블/데이터가 있으면 IF NOT EXISTS로 보존
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
// API Routes
// ---------------------------------------------------------------------------

// 내역 추가
app.post('/api/transactions', async (req, res) => {
  try {
    const { type, category, amount, memo, date } = req.body || {};

    // 입력 검증
    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ success: false, message: "type은 'income' 또는 'expense'여야 합니다." });
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ success: false, message: 'category는 필수입니다.' });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, message: 'amount는 0보다 큰 숫자여야 합니다.' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'date는 필수입니다.' });
    }

    const result = await pool.query(
      `INSERT INTO household_ledger (type, category, amount, memo, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [type, category.trim(), amountNum, memo || '', date]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/transactions error:', err);
    res.status(500).json({ success: false, message: '내역 추가에 실패했습니다.' });
  }
});

// 전체 내역 조회 (최신순)
app.get('/api/transactions', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM household_ledger ORDER BY date DESC, id DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/transactions error:', err);
    res.status(500).json({ success: false, message: '내역 조회에 실패했습니다.' });
  }
});

// 요약 (수입/지출/잔액 + 카테고리별 지출)
app.get('/api/summary', async (_req, res) => {
  try {
    const totalsResult = await pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)::bigint AS income,
        COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::bigint AS expense
      FROM household_ledger
    `);

    const byCategoryResult = await pool.query(`
      SELECT category, SUM(amount)::bigint AS total
      FROM household_ledger
      WHERE type = 'expense'
      GROUP BY category
      ORDER BY total DESC
    `);

    const income = Number(totalsResult.rows[0].income);
    const expense = Number(totalsResult.rows[0].expense);
    const byCategory = byCategoryResult.rows.map((r) => ({
      category: r.category,
      total: Number(r.total),
    }));

    res.json({
      success: true,
      data: { income, expense, balance: income - expense, byCategory },
    });
  } catch (err) {
    console.error('GET /api/summary error:', err);
    res.status(500).json({ success: false, message: '요약 조회에 실패했습니다.' });
  }
});

// 내역 삭제
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '유효하지 않은 id입니다.' });
    }

    const result = await pool.query(
      `DELETE FROM household_ledger WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '해당 내역을 찾을 수 없습니다.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/transactions/:id error:', err);
    res.status(500).json({ success: false, message: '내역 삭제에 실패했습니다.' });
  }
});

// ---------------------------------------------------------------------------
// SPA fallback (Express 4)
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
