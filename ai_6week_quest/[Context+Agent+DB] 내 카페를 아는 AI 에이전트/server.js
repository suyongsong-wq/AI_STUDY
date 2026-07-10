require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ======== Database (공용 Supabase PostgreSQL) ========
// 연결 문자열은 .env의 DATABASE_URL에서 읽습니다. 비밀번호를 코드에 하드코딩하지 않습니다.
// Supabase pooler 연결이므로 SSL 설정이 필요합니다.
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// ======== AI Context: my_cafe.md 를 런타임에 읽어옴 ========
function loadCafeContext() {
  try {
    return fs.readFileSync(path.join(__dirname, 'my_cafe.md'), 'utf8');
  } catch (e) {
    return '';
  }
}

// ======== 카페 운영 데이터 집계 (대시보드 & 에이전트 컨텍스트 공용) ========
async function getCafeData() {
  const [sales, menu, dow, reviewThemes, recentReviews] = await Promise.all([
    pool.query(
      `SELECT count(*)::int days, min(date)::text "from", max(date)::text "to",
              sum(revenue)::int revenue, sum(customers)::int customers
         FROM cafe_sales`
    ),
    pool.query(
      `SELECT menu, sum(qty)::int qty, sum(amount)::int amount
         FROM cafe_menu_sales GROUP BY menu ORDER BY sum(amount) DESC`
    ),
    pool.query(
      `SELECT to_char(date,'Dy') dow, round(avg(revenue))::int avg_rev, round(avg(customers))::int avg_cust
         FROM cafe_sales GROUP BY 1, extract(dow from date) ORDER BY extract(dow from date)`
    ),
    pool.query(
      `SELECT theme, count(*)::int n, round(avg(rating),2)::float avg_rating
         FROM cafe_reviews GROUP BY theme ORDER BY count(*) DESC`
    ),
    pool.query(
      `SELECT date::text, platform, rating, review, theme
         FROM cafe_reviews ORDER BY date DESC LIMIT 8`
    ),
  ]);

  return {
    summary: sales.rows[0],
    menu: menu.rows,
    byDow: dow.rows,
    reviewThemes: reviewThemes.rows,
    recentReviews: recentReviews.rows,
  };
}

// 에이전트 프롬프트에 넣을 DB 요약 텍스트 (숫자 근거 제공)
function dbToText(d) {
  const s = d.summary;
  const won = (n) => Number(n).toLocaleString('ko-KR') + '원';
  const menuLines = d.menu
    .map((m, i) => `  ${i + 1}. ${m.menu} — ${m.qty}잔/개, 매출 ${won(m.amount)}`)
    .join('\n');
  const dowLines = d.byDow
    .map((r) => `  ${r.dow}: 평균 매출 ${won(r.avg_rev)}, 손님 ${r.avg_cust}명`)
    .join('\n');
  const themeLines = d.reviewThemes
    .map((t) => `  ${t.theme}: ${t.n}건, 평균 ★${t.avg_rating}`)
    .join('\n');
  const reviewLines = d.recentReviews
    .map((r) => `  [${r.date}·${r.platform}·★${r.rating}·${r.theme}] ${r.review}`)
    .join('\n');

  return `## 카페 운영 데이터 (최근 ${s.days}일: ${s.from} ~ ${s.to})
- 총매출: ${won(s.revenue)} / 총 손님: ${Number(s.customers).toLocaleString('ko-KR')}명
- 메뉴별 판매 (매출순):
${menuLines}
- 요일별 평균:
${dowLines}
- 리뷰 테마별 평점:
${themeLines}
- 최근 리뷰 원문:
${reviewLines}`;
}

// ======== Gemini API 호출 (REST, Node 18+ 내장 fetch) ========
async function callGemini(systemInstruction, userText) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. .env를 확인하세요.');

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 900,
      // gemini-2.5-flash는 기본적으로 'thinking' 토큰을 소비해 답변이 잘릴 수 있음 → 비활성화
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Gemini API error:', resp.status, errText);
    if (resp.status === 400 || resp.status === 403)
      throw new Error('Gemini API 키가 잘못되었거나 권한이 없습니다.');
    if (resp.status === 429)
      throw new Error('Gemini 무료 사용량 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
    throw new Error('AI 호출에 실패했습니다. 잠시 후 다시 시도하세요.');
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI가 빈 응답을 보냈습니다.');
  return text.trim();
}

// ======== API: 대시보드 데이터 ========
app.get('/api/cafe-data', async (req, res) => {
  try {
    const data = await getCafeData();
    res.json({ success: true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: '카페 데이터를 불러오지 못했습니다: ' + e.message });
  }
});

// ======== API: Before/After 비교 질문 ========
// 같은 질문을 두 에이전트에 동시에 던진다.
//  (1) generic  — my_cafe.md도 DB도 모르는 '일반 카페 컨설턴트' (Before)
//  (2) custom   — my_cafe.md(컨셉) + 실제 운영 DB를 아는 '내 카페 운영 파트너' (After)
// 두 답변 모두 진짜 Gemini 호출 결과다 (규칙기반 아님).
app.post('/api/ask', async (req, res) => {
  try {
    const question = (req.body.question || '').toString().trim();
    if (!question) return res.status(400).json({ success: false, message: '질문을 입력하세요.' });

    // After 쪽에만 넣을 컨텍스트 준비
    const cafeCtx = loadCafeContext();
    const cafeData = await getCafeData();
    const dbText = dbToText(cafeData);

    const GENERIC_SYS =
      '너는 일반적인 카페 창업/운영 컨설턴트 AI다. 특정 카페에 대한 정보는 전혀 모른다. ' +
      '주어진 질문에 일반론적으로만 답하라. 3~5문장, 한국어, 존댓말.';

    const CUSTOM_SYS =
      '너는 "내 카페"를 속속들이 아는 전담 운영 파트너 AI다. 아래에 이 카페의 컨셉 문서(my_cafe.md)와 ' +
      '실제 운영 데이터(매출·메뉴 판매·요일·리뷰)가 주어진다. 반드시 이 카페의 컨셉과 실제 숫자를 근거로 ' +
      '구체적이고 실행 가능한 답을 하라. 답변 안에 실제 수치(매출액·순위·요일·평점 등)를 인용하고, ' +
      'my_cafe.md의 제약사항(예산 50만원·좌석 24석·주방 2명·당일생산)을 반드시 고려하라. ' +
      '3~6문장, 한국어, 존댓말.\n\n' +
      '=== 내 카페 컨셉 (my_cafe.md) ===\n' + cafeCtx + '\n\n' +
      '=== ' + dbText + '\n';

    const [generic, custom] = await Promise.all([
      callGemini(GENERIC_SYS, question),
      callGemini(CUSTOM_SYS, question),
    ]);

    res.json({ success: true, question, generic, custom });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`☕ 카페 에이전트 서버 실행 중: http://localhost:${PORT}`));

module.exports = app;
