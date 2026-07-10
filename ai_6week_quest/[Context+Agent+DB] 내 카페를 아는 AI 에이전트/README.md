# 🅿️ [Context+Agent+DB] 내 카페를 아는 AI 에이전트 — 하버스카페

> 🎯 `my_cafe.md`(컨셉) + Supabase 운영 DB(매출·메뉴·리뷰) + **Gemini LLM**을 결합한 맞춤형 AI 운영 파트너.
> 같은 질문을 **일반 AI(컨텍스트 없음)** vs **내 카페 에이전트(my_cafe.md+DB)**에 동시에 던져 **Before/After**를 비교한다.
> 구분: 🚩퀘스트 · 제출 기한: 월요일 23:59 PM

## ✅ 핵심 차별점 — "진짜 LLM 기반" (규칙기반 아님)
Before/After 두 답변 모두 **실제 Gemini 호출 결과**다. 하드코딩된 템플릿 응답이 아니라,
- **Before**: system 프롬프트에 카페 정보를 전혀 주지 않은 일반 컨설턴트 AI
- **After**: system 프롬프트에 `my_cafe.md` 전문 + Supabase 실시간 집계를 주입한 우리 카페 전담 AI

같은 질문, 같은 모델(`gemini-2.5-flash`), **차이는 오직 Context 유무**. 그래서 Before/After 대비가 순수하게 "컨텍스트의 힘"으로 드러난다.

## 🏗️ 구조
```
[my_cafe.md (컨셉)]  +  [Supabase 카페 운영 DB]  ──▶  server.js /api/ask
                                                        │  같은 질문을 Gemini에 2번
                                                        ├─▶ (Context 없음)  = BEFORE
                                                        └─▶ (my_cafe.md+DB) = AFTER
                                                                 ▼
                                                    index.html에서 나란히 비교
```
- **`server.js`** (Node/Express)
  - `GET /api/cafe-data` — 대시보드 집계(총매출·메뉴 TOP·요일별·리뷰 테마)
  - `POST /api/ask` — 질문 1개 → Gemini 2회 병렬 호출 → `{generic, custom}` 반환
  - **Secret Key(GEMINI_API_KEY)·DB URL은 서버에서만 사용** (프론트 노출 0)
- **`index.html`** (React CDN + Tailwind) — 대시보드 + Before/After 비교 UI + 프리셋 질문
- **`my_cafe.md`** — 카페 컨셉·타겟·시그니처·가격·**제약사항(예산 50만·좌석 24석·주방 2명·당일생산)**
- **DB (공용 Supabase)** — `cafe_sales`(14일 매출) · `cafe_menu_sales`(70행) · `cafe_reviews`(18행)

## 🗄️ 카페 운영 데이터 (요약)
- 총매출 **7,677,000원** / 손님 1,022명 (2026-06-09 ~ 06-22)
- 메뉴 매출 TOP: 흑임자 라떼(2,358,000) · 아메리카노(2,061,000) · 바스크 치즈케이크(1,586,000)
- 요일: 주말(일 690,500 / 토 685,500) 피크, **월요일(438,250) 최저**
- 리뷰 테마: 맛 ★5 · 친절 ★5 · **대기시간 ★2(개선 최우선)**

## 🔬 Before / After 예시
**Q. "신메뉴 뭐 추가할까?"**
- BEFORE(일반 AI): "트렌드·계절 메뉴를 고려하세요" (일반론)
- AFTER(내 에이전트): "흑임자 라떼가 매출 1위, 플레인 스콘은 5위(612,000원)니 시그니처 흑임자를 살린 **흑임자 스콘**. 주방 2명·당일생산 제약 안에서 가능한 단순 공정, 50만원 예산은 신메뉴 홍보에" (우리 숫자·제약 반영)

**Q. "어느 요일에 프로모션?"**
- AFTER: "주말 68만 vs 평일 50만(+30%), **월요일 43만으로 제일 한산** → 평일 1인 바석 작업손님 타겟 아메리카노 리필/디저트 페어링 할인"

## 🚀 실행 & 배포
```bash
npm install
cp .env.example .env   # DATABASE_URL, GEMINI_API_KEY 채우기
npm start              # http://localhost:3000
```
- 배포: Vercel (`vercel.json`으로 server.js=serverless + index.html=static)
- **환경변수는 Vercel 대시보드에 등록** (GEMINI_API_KEY, DATABASE_URL) — 코드/깃에 키 노출 없음

## 📦 제출물
- GitHub 저장소 (이 폴더: `my_cafe.md` + 코드)
- `제출_스크린샷/` — Before/After 2쌍(신메뉴·요일 프로모션) + my_cafe.md 내용 + 대시보드
- `대화내용.txt` — 에이전트와 다듬은 과정
- (보너스) 실제 운영에 쓸 만한 답: **"대기시간 ★2가 리뷰 최저 → 피크시간 대기 개선을 1순위로"** (리뷰 원문 근거)

## 🎯 포인트 매핑
| 항목 | 반영 |
|---|---|
| 기본 완료 10pt | my_cafe.md + DB 연결 + Before/After 스샷 2쌍 ✅ |
| 에이전트 활용 5pt | Gemini 실호출 · 2회 이상 질문 개선(`대화내용.txt`) ✅ |
| 창의성 5pt | 제약사항(예산·좌석·주방) 반영한 실용 시나리오 · 대시보드 개선 우선순위 배지 ✅ |
| 공유 보너스 5pt | 단톡방 공유 시 획득 |
