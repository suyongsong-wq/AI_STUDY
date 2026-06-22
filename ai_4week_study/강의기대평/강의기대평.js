// ============================================================
//  강의 기대평 앱 - 단일 파일 버전 (서버 + 화면 + DB 전부 포함)
//  실행:  node 강의기대평.js
//  접속:  http://localhost:3000
//  외부 패키지 불필요 (Node.js 내장 모듈만 사용)
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const DATA_FILE = path.join(__dirname, "data", "reviews.json"); // DB 역할의 JSON 파일

// ── DB 헬퍼 ───────────────────────────────────────────────
function readReviews() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return []; // 파일 없으면 빈 배열로 시작
  }
}
function writeReviews(reviews) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(reviews, null, 2), "utf-8");
}

// ── 화면(HTML + CSS + 프론트 JS)을 문자열로 포함 ──────────────
const PAGE = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>하버스쿨 AI 교육 · 강의 기대평</title>
  <style>
    :root {
      --bg:#0f172a; --card:#1e293b; --accent:#38bdf8; --star:#fbbf24;
      --text:#e2e8f0; --muted:#94a3b8; --border:#334155;
    }
    * { box-sizing:border-box; margin:0; padding:0; }
    body {
      font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",sans-serif;
      background:var(--bg); color:var(--text); line-height:1.6; min-height:100vh;
    }
    header { text-align:center; padding:56px 20px 32px;
      background:radial-gradient(circle at 50% 0%, #1e3a5f 0%, var(--bg) 70%); }
    header h1 { font-size:1.9rem; margin-bottom:8px; }
    header p { color:var(--muted); }
    .container { max-width:720px; margin:0 auto; padding:0 20px 64px; }
    .form-card { background:var(--card); border:1px solid var(--border);
      border-radius:12px; padding:24px; margin-bottom:32px; }
    .form-card h2 { font-size:1.1rem; margin-bottom:16px; color:var(--accent); }
    label { display:block; font-size:.85rem; color:var(--muted); margin-bottom:6px; }
    input[type="text"], textarea {
      width:100%; background:#0f172a; border:1px solid var(--border);
      border-radius:8px; color:var(--text); padding:10px 12px;
      font-size:.95rem; font-family:inherit; margin-bottom:16px;
    }
    textarea { resize:vertical; min-height:80px; }
    input:focus, textarea:focus { outline:none; border-color:var(--accent); }
    .stars { font-size:1.6rem; margin-bottom:16px; user-select:none; }
    .stars span { cursor:pointer; color:var(--border); transition:color .1s; }
    .stars span.on { color:var(--star); }
    button { width:100%; background:var(--accent); color:#0f172a; border:none;
      border-radius:8px; padding:12px; font-size:1rem; font-weight:700;
      cursor:pointer; transition:opacity .15s; }
    button:hover { opacity:.9; }
    .list-title { font-size:1.1rem; margin-bottom:16px; padding-bottom:8px;
      border-bottom:1px solid var(--border); }
    .review { background:var(--card); border:1px solid var(--border);
      border-radius:12px; padding:18px; margin-bottom:14px; }
    .review-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .review-name { font-weight:700; }
    .review-rating { color:var(--star); font-size:1rem; }
    .review-comment { color:var(--text); }
    .review-date { color:var(--muted); font-size:.78rem; margin-top:8px; }
    .empty { color:var(--muted); text-align:center; padding:32px; }
    footer { text-align:center; color:var(--muted); font-size:.85rem; padding:24px; }
  </style>
</head>
<body>
  <header>
    <h1>⭐ 강의 기대평</h1>
    <p>하버스쿨 AI 교육 · 4주차 강의에 대한 기대를 남겨주세요!</p>
  </header>

  <main class="container">
    <section class="form-card">
      <h2>기대평 작성하기</h2>
      <form id="reviewForm">
        <label for="name">이름</label>
        <input type="text" id="name" placeholder="이름을 입력하세요" maxlength="20" />

        <label>별점</label>
        <div class="stars" id="stars">
          <span data-value="1">★</span>
          <span data-value="2">★</span>
          <span data-value="3">★</span>
          <span data-value="4">★</span>
          <span data-value="5">★</span>
        </div>

        <label for="comment">기대평</label>
        <textarea id="comment" placeholder="이번 강의에서 무엇을 기대하시나요?" maxlength="300"></textarea>

        <button type="submit">등록하기</button>
      </form>
    </section>

    <h2 class="list-title">📝 기대평 목록 (<span id="count">0</span>)</h2>
    <div id="reviewList"></div>
  </main>

  <footer><p>© 2026 Suyong Song · 하버스쿨 AI 교육</p></footer>

  <script>
    // ── 프론트엔드 로직 ──
    let selectedRating = 0;
    const starsEl = document.getElementById("stars");
    const starSpans = starsEl.querySelectorAll("span");

    function paintStars(value) {
      starSpans.forEach(s => s.classList.toggle("on", Number(s.dataset.value) <= value));
    }
    starSpans.forEach(s => {
      s.addEventListener("mouseenter", () => paintStars(Number(s.dataset.value)));
      s.addEventListener("click", () => { selectedRating = Number(s.dataset.value); paintStars(selectedRating); });
    });
    starsEl.addEventListener("mouseleave", () => paintStars(selectedRating));

    function formatDate(iso) {
      const d = new Date(iso);
      const p = n => String(n).padStart(2, "0");
      return d.getFullYear() + "." + p(d.getMonth()+1) + "." + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    }
    function escapeHtml(str) {
      return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }
    function renderReviews(reviews) {
      const listEl = document.getElementById("reviewList");
      document.getElementById("count").textContent = reviews.length;
      if (reviews.length === 0) {
        listEl.innerHTML = '<p class="empty">아직 기대평이 없습니다. 첫 번째로 남겨보세요!</p>';
        return;
      }
      listEl.innerHTML = reviews.map(r => {
        const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
        return '<div class="review"><div class="review-head">' +
          '<span class="review-name">' + escapeHtml(r.name) + '</span>' +
          '<span class="review-rating">' + stars + '</span></div>' +
          '<div class="review-comment">' + escapeHtml(r.comment) + '</div>' +
          '<div class="review-date">' + formatDate(r.createdAt) + '</div></div>';
      }).join("");
    }
    async function loadReviews() {
      try {
        const res = await fetch("/api/reviews");
        renderReviews(await res.json());
      } catch {
        document.getElementById("reviewList").innerHTML =
          '<p class="empty">⚠️ 서버에 연결할 수 없습니다.</p>';
      }
    }
    document.getElementById("reviewForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("name").value.trim();
      const comment = document.getElementById("comment").value.trim();
      if (!name) return alert("이름을 입력해주세요.");
      if (selectedRating < 1) return alert("별점을 선택해주세요.");
      if (!comment) return alert("기대평 내용을 입력해주세요.");
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rating: selectedRating, comment }),
      });
      if (!res.ok) { const err = await res.json(); return alert(err.error || "등록 실패"); }
      e.target.reset(); selectedRating = 0; paintStars(0); loadReviews();
    });
    loadReviews();
  </script>
</body>
</html>`;

// ── JSON 응답 헬퍼 ─────────────────────────────────────────
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// ── 서버 ──────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // 1) 기대평 목록 조회 (최신순)
  if (req.method === "GET" && req.url === "/api/reviews") {
    return sendJson(res, 200, readReviews().sort((a, b) => b.id - a.id));
  }

  // 2) 기대평 작성
  if (req.method === "POST" && req.url === "/api/reviews") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let data;
      try { data = JSON.parse(body || "{}"); }
      catch { return sendJson(res, 400, { error: "잘못된 요청 형식입니다." }); }

      const name = (data.name || "").trim();
      const comment = (data.comment || "").trim();
      const rating = Number(data.rating);

      if (!name) return sendJson(res, 400, { error: "이름을 입력해주세요." });
      if (!comment) return sendJson(res, 400, { error: "기대평 내용을 입력해주세요." });
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        return sendJson(res, 400, { error: "별점은 1~5 사이여야 합니다." });

      const reviews = readReviews();
      const newReview = { id: Date.now(), name, rating, comment, createdAt: new Date().toISOString() };
      reviews.push(newReview);
      writeReviews(reviews);
      return sendJson(res, 201, newReview);
    });
    return;
  }

  // 3) 그 외 모든 요청 → 화면(HTML) 응답
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

server.listen(PORT, () => {
  console.log(`✅ 강의 기대평 서버 실행: http://localhost:${PORT}`);
  console.log(`   DB 파일: ${DATA_FILE}`);
});
