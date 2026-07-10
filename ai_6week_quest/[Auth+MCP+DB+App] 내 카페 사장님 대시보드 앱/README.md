# ☕ 내 카페 사장님 대시보드 (Auth + DB + API + AI)

성수동 '하버스카페' 사장님이 로그인하면 **매출·인기메뉴·리뷰·날씨·할일**이 한 화면에 모이고, **AI가 오늘의 브리핑**을 생성해주는 대시보드. EMBER Roasters 쇼핑몰과 톤을 통일한 다크 UI.

## 🔗 제출물
- **배포 URL (Vercel)**: https://cafe-owner-dashboard.vercel.app
- **GitHub**: (저장소 링크)
- **스크린샷**: `제출_스크린샷/01_대시보드_배포본_실행화면.png` (로그인 → 카페 데이터 → AI 브리핑)
- **데모 로그인 (채점용)**: `suyong.song@griff.co.kr` / `1234`
  - ⚠️ 보안상 로그인 화면에는 노출하지 않음(사장님 전용). 채점 시 위 계정 사용.

## 🔌 연결한 데이터 소스 (3개 — 요구 2개+ 초과)
| # | 소스 | 용도 | 위젯 |
| --- | --- | --- | --- |
| 1 | **Supabase (DB)** | 카페 운영 데이터 — `cafe_sales`(매출·손님), `cafe_menu_sales`(메뉴 판매), `cafe_reviews`(리뷰) | 이번 주 매출 · 인기메뉴 TOP3 · 리뷰 요약 |
| 2 | **외부 API (open-meteo)** | 성수동 실시간 날씨·강수확률(손님 수·수요 예측) | 오늘 성수동 날씨 |
| 3 | **localStorage** | 사장님 오늘 할일/발주 메모(Notion MCP 대체) | 오늘 할일 |

## 🤖 AI 브리핑 (Part 3)
- **실제 LLM(Google Gemini 2.5-flash)** 호출 — 규칙기반 아님.
- 서버리스 함수 `api/brief.js`가 매출 추세·인기메뉴·리뷰(불만)·날씨를 종합해 "오늘의 카페 브리핑" 생성.
- **API 키는 서버(Vercel 환경변수 `GEMINI_API_KEY`)에서만 사용** — 프론트엔드에 노출 안 함.

## 🔐 인증 (Part 1)
- supabase-js Auth(이메일/비밀번호). 로그인해야 대시보드 접근(사장님만).

## 🗂️ 구조
```
index.html               # 프론트(React CDN + Tailwind, EMBER 디자인), Auth·위젯
api/brief.js             # Vercel 서버리스: POST /api/brief → Gemini 호출
lib/generateBriefing.js  # 브리핑 코어(서버리스·로컬 공용)
server.js                # 로컬 개발 서버(node server.js → localhost:3000)
vercel.json · package.json · .env.example
```

## ▶️ 로컬 실행
```bash
cp .env.example .env      # GEMINI_API_KEY 입력
node server.js            # http://localhost:3000
```

## 🎨 디자인
EMBER Roasters 팔레트(ink `#0b0a09` · ember `#ff5a1f` · paper `#ece6dc`) + Space Grotesk/Space Mono + 필름 그레인.
