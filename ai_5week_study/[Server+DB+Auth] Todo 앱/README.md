# 📝 Todo App + 🛠️ 관리자 대시보드 (로그인 + DB)

5주차 학습용. **Express 백엔드 + 직접 만든 JWT 인증(B 방식)** 으로 만든 Todo 앱입니다.
로그인한 사람만 자기 할 일을 보고, **관리자(admin)는 전체 사용자/할일 현황 대시보드**를 봅니다.

## 이 앱으로 배우는 것 (5주차: Auth)

- **회원가입/로그인** — 비밀번호를 `bcrypt`로 해싱해 저장, 로그인 성공 시 **JWT 토큰** 발급
- **인증 미들웨어** — 요청 헤더의 `Authorization: Bearer <token>`를 검증(`requireAuth`)
- **권한(인가)** — 일반 유저 vs 관리자(`requireAdmin`, role≠admin이면 403)
- **DB 연결** — Supabase PostgreSQL(`pg`)에 `users`·`todos` 저장

## 실행 방법

```bash
cd "ai_5week_study/[Server+DB+Auth] Todo 앱"
npm install        # 최초 1회
PORT=3011 node server.js
#  → http://localhost:3011
```

`.env`에 `DATABASE_URL`(Supabase pooler)과 `JWT_SECRET`이 필요합니다.

## 🔑 데모 계정 (이미 가입+시딩됨)

| 역할 | 이메일 | 비밀번호 |
|------|--------|----------|
| **관리자** | `suyong.song@griff.co.kr` | `todo1234` |
| 일반 유저 | `alice@test.com` | `alice123` |
| 일반 유저 | `bob@test.com` | `bob12345` |

- 관리자로 로그인하면 사용자 화면 헤더에 **"관리자"** 버튼이 보이고, 누르면 대시보드(`/admin.html`)로 갑니다.
- 관리자 대시보드: **전체 사용자 수 / 전체 할일 / 완료율 + 사용자별 할일·완료 집계 표**

## 관리자 권한 부여 방법

가입하면 누구나 `role='user'`입니다. 관리자로 만들려면 DB에서 직접 승격:

```sql
update users set role = 'admin' where email = 'someone@example.com';
```

승격 후에는 **다시 로그인**해야 새 토큰에 admin 권한이 담깁니다.

## 폴더 구조

```
server.js                 # Express 앱 (pg Pool, 라우터 마운트, initDB)
db/schema.sql             # 테이블 정의 (문서용)
middleware/auth.js        # requireAuth, requireAdmin
utils/password.js         # bcrypt 해시/검증
utils/jwt.js              # JWT 서명/검증 (만료 7d)
api/auth/{register,login,me}.js
api/todos/{list,create,update,remove}.js
api/admin/overview.js     # 관리자 통계 API
index.html                # 사용자 화면 (로그인 + 할일)
admin.html                # 관리자 대시보드
```

## API 요약

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/auth/register` | - | 회원가입 → `{token,user}` |
| POST | `/api/auth/login` | - | 로그인 → `{token,user}` |
| GET | `/api/auth/me` | 🔑 | 내 정보 |
| GET/POST | `/api/todos` | 🔑 | 내 할일 조회/추가 |
| PATCH/DELETE | `/api/todos/:id` | 🔑 | 내 할일 수정/삭제 |
| GET | `/api/admin/overview` | 🔑👑 | (관리자) 전체 통계·유저별 집계 |

응답은 항상 `{success, data}` 또는 `{success:false, message}` 형식입니다.

## ✅ 검증 완료

회원가입·로그인(JWT), 할일 CRUD, **사용자 간 데이터 격리**(남의 할일 못 봄/못 지움), 관리자 통계 집계, **권한 분리**(일반 유저·비로그인은 관리자 API 차단 403/401)까지 자동 테스트 9/9 통과.
