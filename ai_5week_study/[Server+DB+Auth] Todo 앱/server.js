// ============================================================
// Express 앱 엔트리포인트
// - pg Pool 생성 (Supabase pooler, ssl)
// - express.json / express.static
// - 라우터 마운트 (api/* 의 엔드포인트들을 묶음)
// - initDB() 로 테이블 1회 생성
// - require.main === module 일 때만 listen, 항상 module.exports
// ============================================================
require('dotenv').config();

const path = require('path');
const express = require('express');
const { Pool } = require('pg');

// --- 필수 환경변수 확인 (없으면 빠르게 실패) ---
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 환경변수가 설정되어 있지 않습니다. .env 를 확인하세요.');
}
// JWT_SECRET 검증은 utils/jwt.js 에서 require 시 수행됩니다.

// --- DB 풀 (Supabase pooler는 self-signed 체인이라 rejectUnauthorized:false) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const app = express();

// 미들웨어
app.use(express.json());

// 엔드포인트 파일들이 req.app.locals.pool 로 풀에 접근
app.locals.pool = pool;

// --- 라우터 마운트 ---
// (API 라우터를 정적 서빙보다 먼저 등록해야 express.static 의 디렉터리
//  리다이렉트(301)가 /api/todos 같은 경로를 가로채지 않습니다.)
// 인증
app.use('/api/auth', require('./api/auth/register'));
app.use('/api/auth', require('./api/auth/login'));
app.use('/api/auth', require('./api/auth/me'));
// 할일 CRUD
app.use('/api/todos', require('./api/todos/list'));
app.use('/api/todos', require('./api/todos/create'));
app.use('/api/todos', require('./api/todos/update'));
app.use('/api/todos', require('./api/todos/remove'));
// 관리자
app.use('/api/admin', require('./api/admin/overview'));

// 정적 파일(index.html / admin.html) — API 라우터 다음에 서빙
app.use(express.static(__dirname));

// --- 404 (정의되지 않은 /api 경로) ---
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: '존재하지 않는 API 경로입니다.' });
});

// --- 공통 에러 핸들러 (스택트레이스를 클라이언트에 노출하지 않음) ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message); // 서버 로그에만 남김
  res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
});

// --- 테이블 생성 (앱 시작 시 1회) ---
async function initDB() {
  await pool.query(`
    create table if not exists users (
      id            bigserial primary key,
      email         text unique not null,
      password_hash text not null,
      role          text not null default 'user',
      created_at    timestamptz not null default now()
    );
  `);
  await pool.query(`
    create table if not exists todos (
      id          bigserial primary key,
      user_id     bigint not null references users(id) on delete cascade,
      text        text not null,
      done        boolean not null default false,
      created_at  timestamptz not null default now()
    );
  `);
  console.log('[initDB] 테이블 준비 완료');
}

// --- 직접 실행될 때만 서버 listen ---
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  initDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`서버 실행 중: http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[initDB 실패]', err.message);
      process.exit(1);
    });
}

module.exports = app;
