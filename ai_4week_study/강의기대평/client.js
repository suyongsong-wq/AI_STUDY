// 강의 기대평 - 프론트엔드 로직
// 서버 API(/api/reviews)와 fetch 로 통신합니다.

let selectedRating = 0; // 사용자가 선택한 별점

// ── 별점 선택 UI ───────────────────────────────────────────
const starsEl = document.getElementById("stars");
const starSpans = starsEl.querySelectorAll("span");

// 별점 표시 갱신: value 이하의 별을 켬
function paintStars(value) {
  starSpans.forEach((s) => {
    s.classList.toggle("on", Number(s.dataset.value) <= value);
  });
}

starSpans.forEach((s) => {
  // 마우스 올리면 미리보기
  s.addEventListener("mouseenter", () => paintStars(Number(s.dataset.value)));
  // 클릭하면 확정
  s.addEventListener("click", () => {
    selectedRating = Number(s.dataset.value);
    paintStars(selectedRating);
  });
});
// 마우스가 떠나면 선택된 별점으로 복귀
starsEl.addEventListener("mouseleave", () => paintStars(selectedRating));

// ── 목록 불러오기 ──────────────────────────────────────────
async function loadReviews() {
  try {
    const res = await fetch("/api/reviews");
    const reviews = await res.json();
    renderReviews(reviews);
  } catch (err) {
    // fetch 실패 = 서버에 연결 안 됨 (보통 파일을 직접 연 경우)
    const listEl = document.getElementById("reviewList");
    listEl.innerHTML =
      '<p class="empty">⚠️ 서버에 연결할 수 없습니다.<br>' +
      "터미널에서 <b>node server.js</b> 를 실행한 뒤<br>" +
      "<b>http://localhost:3000</b> 주소로 접속하세요.</p>";
  }
}

// 날짜를 보기 좋게 포맷
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

// HTML 특수문자 이스케이프(XSS 방지)
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 목록을 화면에 그림
function renderReviews(reviews) {
  const listEl = document.getElementById("reviewList");
  document.getElementById("count").textContent = reviews.length;

  if (reviews.length === 0) {
    listEl.innerHTML = '<p class="empty">아직 기대평이 없습니다. 첫 번째로 남겨보세요!</p>';
    return;
  }

  listEl.innerHTML = reviews
    .map((r) => {
      const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
      return `
        <div class="review">
          <div class="review-head">
            <span class="review-name">${escapeHtml(r.name)}</span>
            <span class="review-rating">${stars}</span>
          </div>
          <div class="review-comment">${escapeHtml(r.comment)}</div>
          <div class="review-date">${formatDate(r.createdAt)}</div>
        </div>
      `;
    })
    .join("");
}

// ── 폼 제출(작성) ──────────────────────────────────────────
document.getElementById("reviewForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const comment = document.getElementById("comment").value.trim();

  // 간단한 클라이언트 검증
  if (!name) return alert("이름을 입력해주세요.");
  if (selectedRating < 1) return alert("별점을 선택해주세요.");
  if (!comment) return alert("기대평 내용을 입력해주세요.");

  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, rating: selectedRating, comment }),
  });

  if (!res.ok) {
    const err = await res.json();
    return alert(err.error || "등록에 실패했습니다.");
  }

  // 폼 초기화 후 목록 새로고침
  e.target.reset();
  selectedRating = 0;
  paintStars(0);
  loadReviews();
});

// 페이지 로드 시 목록 불러오기
loadReviews();
