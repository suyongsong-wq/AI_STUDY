// ============================================================
//  메모장 앱 서버 - Supabase(PostgreSQL) 연동
//  브라우저(React) → 이 서버 → Supabase Postgres DB
//
//  실행 전: npm install pg
//  실행:    node server.js   (연결정보는 같은 폴더 .env 에서 읽음)
//  (비밀번호를 코드에 박지 않고 .env 로 분리 = 안전, git에 안 올라감)
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;

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
if (!process.env.PGHOST || !process.env.PGPASSWORD) {
  console.error("❌ .env 에 PGHOST/PGUSER/PGPASSWORD 등이 설정되지 않았습니다.");
  process.exit(1);
}

// 2) Postgres 연결 풀 (host/port/user/password/database는 PG* 환경변수에서 자동 인식)
//    Supabase는 SSL 필요.
const pool = new Pool({
  ssl: { rejectUnauthorized: false },
});

// 3) 시작 시 memos 테이블이 없으면 생성
//    컬럼: id(자동증가), title(제목), content(내용), created_at(작성시각)
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memos (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log("✅ memos 테이블 준비 완료");
}

// ── 헬퍼 ──────────────────────────────────────────────────
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
// 요청 본문(JSON)을 Promise 로 읽는다. async 핸들러에서 await 로 쓰면
// 안에서 난 에러도 바깥 try/catch 가 잡아 서버가 죽지 않는다.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}
// URL 끝의 :id 를 안전하게 정수로 파싱. 숫자가 아니면 null.
function parseId(url) {
  const n = Number(url.split("/").pop());
  return Number.isInteger(n) && n > 0 ? n : null;
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
    const query = new URLSearchParams(req.url.split("?")[1] || "");

    // 목록 조회 + 검색 (GET /api/memos?q=검색어)
    //   q 가 있으면 title/content 에서 부분일치(대소문자 무시) 검색
    if (req.method === "GET" && url === "/api/memos") {
      const q = (query.get("q") || "").trim();
      let rows;
      if (q) {
        ({ rows } = await pool.query(
          `SELECT * FROM memos
             WHERE title ILIKE $1 OR content ILIKE $1
             ORDER BY created_at DESC`,
          [`%${q}%`]
        ));
      } else {
        ({ rows } = await pool.query("SELECT * FROM memos ORDER BY created_at DESC"));
      }
      return sendJson(res, 200, rows);
    }

    // 작성 (POST /api/memos)
    if (req.method === "POST" && url === "/api/memos") {
      let data;
      try { data = await readBody(req); }
      catch { return sendJson(res, 400, { error: "잘못된 요청(JSON 형식 오류)" }); }
      const title = (data.title || "").trim();
      const content = (data.content || "").trim();
      if (!title) return sendJson(res, 400, { error: "제목을 입력하세요." });
      const { rows } = await pool.query(
        "INSERT INTO memos (title, content) VALUES ($1, $2) RETURNING *",
        [title, content]
      );
      return sendJson(res, 201, rows[0]);
    }

    // 수정 (PUT /api/memos/:id) - 제목/내용 갱신 [보너스]
    if (req.method === "PUT" && url.startsWith("/api/memos/")) {
      const id = parseId(url);
      if (!id) return sendJson(res, 400, { error: "잘못된 id 입니다." });
      let data;
      try { data = await readBody(req); }
      catch { return sendJson(res, 400, { error: "잘못된 요청(JSON 형식 오류)" }); }
      const title = (data.title || "").trim();
      const content = (data.content || "").trim();
      if (!title) return sendJson(res, 400, { error: "제목을 입력하세요." });
      const { rows } = await pool.query(
        "UPDATE memos SET title = $1, content = $2 WHERE id = $3 RETURNING *",
        [title, content, id]
      );
      if (!rows[0]) return sendJson(res, 404, { error: "메모를 찾을 수 없습니다." });
      return sendJson(res, 200, rows[0]);
    }

    // 삭제 (DELETE /api/memos/:id)
    if (req.method === "DELETE" && url.startsWith("/api/memos/")) {
      const id = parseId(url);
      if (!id) return sendJson(res, 400, { error: "잘못된 id 입니다." });
      await pool.query("DELETE FROM memos WHERE id = $1", [id]);
      return sendJson(res, 200, { ok: true });
    }

    // 그 외 → 프론트엔드 화면
    return serveFile(res, "index.html");
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
