// 강의 기대평 DB 서버
// 순수 Node.js 내장 모듈(http, fs, path)만 사용합니다. (npm 설치 불필요)
// 실행: node server.js  →  http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const PUBLIC_DIR = __dirname;                          // 현재 폴더(ai_4week_study)
const DATA_FILE = path.join(__dirname, "data", "reviews.json"); // DB 역할의 JSON 파일

// ── DB 헬퍼 ───────────────────────────────────────────────
// reviews.json 을 읽어 배열로 반환. 파일이 없거나 비어있으면 빈 배열.
function readReviews() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return []; // 파일이 없으면 빈 배열로 시작
  }
}

// 배열을 reviews.json 에 저장(읽기 좋게 들여쓰기).
function writeReviews(reviews) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); // data 폴더 보장
  fs.writeFileSync(DATA_FILE, JSON.stringify(reviews, null, 2), "utf-8");
}

// ── 정적 파일 서빙 ─────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveStatic(req, res) {
  // "/" 요청은 index.html 로 매핑
  let urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(PUBLIC_DIR, decodeURIComponent(urlPath));

  // 폴더 밖으로 벗어나는 경로 차단(보안)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

// 요청 body(JSON)를 모아서 파싱해주는 헬퍼
function parseBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      callback(null, body ? JSON.parse(body) : {});
    } catch (e) {
      callback(e);
    }
  });
}

// JSON 응답 헬퍼
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// ── 서버 ──────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // 1) 기대평 목록 조회 (최신순)
  if (req.method === "GET" && req.url === "/api/reviews") {
    const reviews = readReviews().sort((a, b) => b.id - a.id); // id 큰 순 = 최신순
    return sendJson(res, 200, reviews);
  }

  // 2) 기대평 작성
  if (req.method === "POST" && req.url === "/api/reviews") {
    return parseBody(req, (err, data) => {
      if (err) return sendJson(res, 400, { error: "잘못된 요청 형식입니다." });

      const name = (data.name || "").trim();
      const comment = (data.comment || "").trim();
      const rating = Number(data.rating);

      // 입력 검증
      if (!name) return sendJson(res, 400, { error: "이름을 입력해주세요." });
      if (!comment) return sendJson(res, 400, { error: "기대평 내용을 입력해주세요." });
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return sendJson(res, 400, { error: "별점은 1~5 사이여야 합니다." });
      }

      const reviews = readReviews();
      const newReview = {
        id: Date.now(),                 // 고유 id (작성 시각 밀리초)
        name,
        rating,
        comment,
        createdAt: new Date().toISOString(),
      };
      reviews.push(newReview);
      writeReviews(reviews);            // data/reviews.json 에 저장

      return sendJson(res, 201, newReview);
    });
  }

  // 3) 그 외에는 정적 파일 서빙
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   DB 파일: ${DATA_FILE}`);
});
