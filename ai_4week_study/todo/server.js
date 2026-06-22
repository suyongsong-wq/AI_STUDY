// ============================================================
//  할 일 앱 서버 - Supabase(PostgreSQL) 연동
//  브라우저(React) → 이 서버 → Supabase Postgres DB
//
//  실행 전: npm install pg
//  실행:    DATABASE_URL="postgresql://...비번포함...:6543/postgres" node server.js
//  (비밀번호를 코드에 박지 않고 환경변수로 넘깁니다 = 안전, git에 안 올라감)
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const PORT = 3000;

// 0) 같은 폴더의 .env 파일을 읽어 환경변수로 로드 (외부 패키지 없이)
//    .env 는 .gitignore 로 제외되므로 비밀번호가 git에 올라가지 않습니다.
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, ".env");
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); // 양끝 따옴표 제거
      }
    }
  } catch { /* .env 없으면 무시 (환경변수로 직접 줄 수도 있음) */ }
})();

// 1) DB 연결 정보 확인 (.env의 PGHOST/PGUSER/PGPASSWORD ...)
//    특수문자가 있는 비밀번호도 안전하도록 URL이 아닌 항목별 변수로 받습니다.
if (!process.env.PGHOST || !process.env.PGPASSWORD) {
  console.error("❌ .env 에 PGHOST/PGUSER/PGPASSWORD 등이 설정되지 않았습니다.");
  process.exit(1);
}

// 2) Postgres 연결 풀 (host/port/user/password/database는 PG* 환경변수에서 자동 인식)
//    Supabase는 SSL 필요.
const pool = new Pool({
  ssl: { rejectUnauthorized: false },
});

// 3) 시작 시 todos 테이블이 없으면 생성
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      text        TEXT NOT NULL,
      done        BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log("✅ todos 테이블 준비 완료");
}

// ── 헬퍼 ──────────────────────────────────────────────────
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
function readBody(req, cb) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try { cb(null, body ? JSON.parse(body) : {}); }
    catch (e) { cb(e); }
  });
}

// 정적 파일(프론트엔드) 서빙
function serveFile(res, file) {
  fs.readFile(path.join(__dirname, file), (err, content) => {
    if (err) { res.writeHead(404); return res.end("Not Found"); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
  });
}

// ── 서버 ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split("?")[0];

    // 목록 조회
    if (req.method === "GET" && url === "/api/todos") {
      const { rows } = await pool.query("SELECT * FROM todos ORDER BY created_at ASC");
      return sendJson(res, 200, rows);
    }

    // 추가
    if (req.method === "POST" && url === "/api/todos") {
      return readBody(req, async (err, data) => {
        if (err) return sendJson(res, 400, { error: "잘못된 요청" });
        const text = (data.text || "").trim();
        if (!text) return sendJson(res, 400, { error: "내용을 입력하세요." });
        const { rows } = await pool.query(
          "INSERT INTO todos (text) VALUES ($1) RETURNING *",
          [text]
        );
        sendJson(res, 201, rows[0]);
      });
    }

    // 완료 토글 (PATCH /api/todos/:id)
    if (req.method === "PATCH" && url.startsWith("/api/todos/")) {
      const id = Number(url.split("/").pop());
      return readBody(req, async (err, data) => {
        const { rows } = await pool.query(
          "UPDATE todos SET done = $1 WHERE id = $2 RETURNING *",
          [!!data.done, id]
        );
        sendJson(res, 200, rows[0] || {});
      });
    }

    // 삭제 (DELETE /api/todos/:id)
    if (req.method === "DELETE" && url.startsWith("/api/todos/")) {
      const id = Number(url.split("/").pop());
      await pool.query("DELETE FROM todos WHERE id = $1", [id]);
      return sendJson(res, 200, { ok: true });
    }

    // 완료 항목 일괄 삭제
    if (req.method === "DELETE" && url === "/api/todos") {
      await pool.query("DELETE FROM todos WHERE done = true");
      return sendJson(res, 200, { ok: true });
    }

    // 그 외 → 프론트엔드 화면
    return serveFile(res, "index-db.html");
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: e.message });
  }
});

// DB 초기화 후 서버 시작
initDB()
  .then(() => {
    server.listen(PORT, () => console.log(`✅ 서버 실행: http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("❌ DB 연결 실패:", e.message);
    process.exit(1);
  });
