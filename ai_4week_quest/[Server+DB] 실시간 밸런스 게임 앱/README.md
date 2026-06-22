# ⚖️ 실시간 밸런스 게임 앱

하버스쿨 AI 교육 · **4주차 퀘스트 (15 Point)**
> Server + DB(Supabase)를 조합해서 실시간 밸런스 게임 앱을 만드세요!

"월급 500 + 주7일 vs 월급 300 + 주4일" 같은 **A vs B 질문**에 투표하면,
**실시간으로 투표율(퍼센티지 바)** 이 바뀌는 웹앱입니다.
여러 명이 같은 링크로 동시에 투표하면 결과가 한 DB에 모여 함께 집계됩니다.

🔗 **배포 링크:** https://balance-game-app.vercel.app

---

## ✨ 기능
- ➕ 밸런스 게임 질문 등록 (선택지 A vs B)
- 🗳️ 둘 중 하나에 투표 → **실시간 퍼센티지 바** 갱신
- 📊 각 선택지 득표 수 + **총 참여자 수** 표시
- 💾 모든 데이터(질문·투표) **Supabase PostgreSQL DB**에 저장
- 🔄 8초마다 자동 새로고침 → 다른 사람 투표도 실시간 반영

### 🎨 창의성 추가 요소
- 🔥 **지금 가장 뜨거운 질문** — 참여자 최다 질문을 상단 배너로 랭킹
- 👍 **다수파 / 🦄 소수파 뱃지** — 투표 후 내 선택이 다수인지 소수인지 표시
- ⚖️ **실시간 한마디** — 격차에 따라 "🔥 초접전 / 😮 압도적 우세 / 의견이 갈리네요"
- 🗳️ **1인 1표 (중복 투표 방지)** — localStorage로 기억, 투표 후 버튼 잠금 + "✓ 내 선택" 표시 (새로고침해도 유지)

## 🛠️ 기술 스택
- **Backend**: Node.js · Express · `pg` (node-postgres)
- **DB**: Supabase PostgreSQL (pooler, SSL)
- **Frontend**: React 18 + Tailwind CSS (CDN, 단일 index.html)
- **배포**: Vercel

## 🗄️ DB 스키마 (테이블 2개, 1:N 관계)
**`questions`** — 밸런스 게임 질문
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL PK | 질문 고유 번호 |
| option_a | TEXT | 선택지 A |
| option_b | TEXT | 선택지 B |
| created_at | TIMESTAMPTZ | 등록 시각 |

**`votes`** — 투표 기록 (질문과 1:N, 질문 삭제 시 CASCADE)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL PK | 투표 고유 번호 |
| question_id | BIGINT FK → questions(id) | 어떤 질문에 대한 투표인지 |
| choice | TEXT CHECK ('A'\|'B') | 고른 선택지 |
| created_at | TIMESTAMPTZ | 투표 시각 |

> 투표율은 votes를 choice별로 COUNT해서 비율로 계산합니다 (percentA + percentB = 100).

## 🔌 REST API
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/questions` | 질문 목록 + 실시간 A/B 집계 (최신순) |
| POST | `/api/questions` | 질문 등록 `{optionA, optionB}` |
| POST | `/api/questions/:id/vote` | 투표 `{choice:'A'\|'B'}` → votes에 INSERT, 갱신된 집계 반환 |
| DELETE | `/api/questions/:id` | 질문 삭제 (투표도 CASCADE) |

## 🚀 실행 방법
```bash
cd "ai_4week_quest/[Server+DB] 실시간 밸런스 게임 앱"
npm install

# .env 파일을 열어 [YOUR-PASSWORD]를 실제 Supabase DB 비밀번호로 교체
npm start
# → http://localhost:3000  (포트 충돌 시: PORT=3100 npm start)
```
> 첫 실행 시 `questions`·`votes` 테이블이 자동 생성되고, 밸런스 게임 질문 6개가 시드로 등록됩니다.

## 🔐 환경 변수 (`.env`)
```
DATABASE_URL=postgresql://postgres.<PROJECT>:<PASSWORD>@aws-1-us-west-1.pooler.supabase.com:6543/postgres
PORT=3000
```
> 비밀번호에 특수문자가 있으면 **URL 인코딩** 필요 (예: `*` → `%2A`, `$` → `%24`).
> `.env`는 `.gitignore`에 포함되어 깃에 올라가지 않습니다. (Vercel 배포 시 환경변수로 별도 등록)

## 🔁 데이터 흐름
```
[질문 등록 A vs B] → [투표 선택] → [Server] → DB(votes) INSERT
                                       │
                            A/B COUNT 집계 → 투표율 계산
                                       ▼
                          퍼센티지 바 실시간 업데이트
```
