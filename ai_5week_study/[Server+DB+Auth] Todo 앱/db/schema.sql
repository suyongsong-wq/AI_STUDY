-- ============================================================
-- DB 스키마 (참고/문서용)
-- 실제 생성은 server.js의 initDB()가 앱 시작 시 1회 수행합니다.
-- Supabase PostgreSQL (pooler, port 6543)
-- ============================================================

-- 사용자 테이블
create table if not exists users (
  id            bigserial primary key,
  email         text unique not null,
  password_hash text not null,                  -- bcrypt 해시만 저장 (평문 금지)
  role          text not null default 'user',   -- 'user' | 'admin'
  created_at    timestamptz not null default now()
);

-- 할일 테이블
create table if not exists todos (
  id          bigserial primary key,
  user_id     bigint not null references users(id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
