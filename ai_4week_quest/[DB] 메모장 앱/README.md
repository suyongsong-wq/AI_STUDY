# 📔 나의 다이어리 — [DB] 메모장 앱

하버스쿨 AI 교육 · **4주차 퀘스트 (15 Point)**
> PostgreSQL DB 서버를 활용해서 메모장 앱을 만드세요!

메모를 작성·조회·수정·삭제할 수 있는 다이어리 감성의 웹앱입니다.
모든 기록은 **Supabase PostgreSQL DB**에 저장되어, 앱을 껐다 켜도 사라지지 않습니다.

---

## ✨ 기능
- 📝 메모 작성 (제목 + 내용)
- 📖 메모 목록 조회 (최신순)
- ✏️ 메모 수정 *(보너스)*
- 🗑️ 메모 삭제
- 🔍 제목·내용 검색 *(보너스)*
- 💾 PostgreSQL DB 저장 → **재시작해도 데이터 유지**

## 🛠️ 기술 스택
- **Backend**: Node.js · Express · `pg` (node-postgres)
- **DB**: Supabase PostgreSQL (pooler, SSL)
- **Frontend**: React 18 + Tailwind CSS (CDN, 단일 index.html)
- 폰트: Gaegu(손글씨) · Nanum Myeongjo(명조)

## 🗄️ DB 스키마 (`memos` 테이블)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL PK | 메모 고유 번호 |
| title | TEXT | 제목 |
| content | TEXT | 내용 |
| created_at | TIMESTAMPTZ | 작성 시각 |
| updated_at | TIMESTAMPTZ | 수정 시각 |

## 🔌 REST API
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/memos` | 전체 목록 (최신순) |
| POST | `/api/memos` | 생성 |
| PUT | `/api/memos/:id` | 수정 |
| DELETE | `/api/memos/:id` | 삭제 |

## 🚀 실행 방법
```bash
cd "ai_4week_quest/[DB] 메모장 앱"
npm install

# .env 파일을 열어 [YOUR-PASSWORD]를 실제 Supabase DB 비밀번호로 교체
npm start
# → http://localhost:3000  (포트 충돌 시: PORT=3100 npm start)
```

## 🔐 환경 변수 (`.env`)
```
DATABASE_URL=postgresql://postgres.<PROJECT>:<PASSWORD>@aws-1-us-west-1.pooler.supabase.com:6543/postgres
PORT=3000
```
> 비밀번호에 특수문자가 있으면 **URL 인코딩** 필요 (예: `*` → `%2A`, `$` → `%24`).
> `.env`는 `.gitignore`에 포함되어 깃에 올라가지 않습니다.
