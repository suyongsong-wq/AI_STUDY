# 🥕 당근마켓 클론 — 우리 동네 중고거래

> 7주차 퀘스트 1 `[Final] 당근마켓 클론`
> **Auth + DB + Storage(이미지 업로드) + 1:1 채팅**을 한 앱에 통합한 파이널 프로젝트

**배포 URL** → https://carrot-market-clone-ashen.vercel.app

---

## 한 줄 소개

동네를 설정하고, 사진과 함께 물건을 올리고, 관심 물건에 **판매자와 1:1 채팅**으로 흥정까지 하는 중고 직거래 앱.

---

## 구현한 기능 (퀘스트 Part 매핑)

| Part | 요구사항 | 구현 |
|---|---|---|
| **1. 회원가입 & 로그인** | 이메일 가입 + 동네 설정 | Supabase Auth 이메일/비밀번호 · 가입 시 **닉네임 + 동네** 입력 (프리셋 8곳 + 직접 입력) |
| **2. 상품 등록** | 이미지 최대 3장 + 제목·가격·설명·카테고리 / 본인만 수정·삭제 | Supabase Storage 업로드(최대 3장, 개별 삭제 가능) · 카테고리 10종 · **RLS로 본인만 수정/삭제** |
| **3. 목록 & 상세** | 최신순 + 카테고리 필터 + 검색 / 상세·슬라이드·관심 | 최신순 목록 · 카테고리 필터 · **제목+설명 키워드 검색** · 스와이프 이미지 슬라이드 · 관심(찜) 토글 + 카운트 |
| **4. 채팅** | 1:1 문의 · Polling 실시간 | 상세 → "채팅하기" → 방 자동 생성(중복 방지) · **2.5초 폴링**으로 신규 메시지 수신 |
| **5. 마이페이지** | 내 상품 / 관심 / 채팅 | 3탭 (판매 상품 · 관심 목록 · 채팅) |
| **6. 배포** | Vercel + 공유 URL | ✅ 위 URL |

추가로 넣은 것: 거래완료 토글, 나눔(0원) 표시, 비로그인 둘러보기, 기존 계정용 동네 온보딩.

---

## 기술 구조

```
브라우저 (단일 index.html)
  React 18 UMD + Babel Standalone + Tailwind CDN
        │
        └── @supabase/supabase-js v2 ──► Supabase
                                          ├─ Auth      (auth.users)
                                          ├─ Database  (carrot_* 5개 테이블 + RLS)
                                          └─ Storage   (carrot-images 버킷)
```

**서버가 없습니다.** 5주차에 쓴 프론트엔드-온리 방식으로, 브라우저가 Supabase를 직접 호출합니다.
publishable 키는 공개되어도 안전하며, **보안은 전적으로 RLS 정책이 담당**합니다.

### 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 전체 (라우팅·화면·Supabase 호출) |
| `db/schema.sql` | 테이블 · RLS 정책 · Storage 버킷 DDL |
| `vercel.json` | 정적 배포 설정 |

---

## DB 스키마

```
carrot_profiles   id(=auth.users.id) · nickname · region
carrot_products   user_id → profiles · title · price · description · category
                  · region · images[] (최대 3) · status(selling|sold)
carrot_favorites  user_id · product_id            (unique 쌍)
carrot_chat_rooms product_id · buyer_id · seller_id (unique 쌍 = 방 중복 방지)
carrot_messages   room_id · sender_id · content
```

> 설계 노트: 사용자 참조 FK를 `auth.users`가 아니라 **`carrot_profiles`로** 걸었습니다.
> PostgREST는 FK가 있어야 조인(임베딩)을 해주는데 `auth` 스키마로는 조인이 불가능해서,
> 판매자 닉네임을 상품과 함께 한 번에 가져오려면 이 구조가 필요합니다.

### RLS 정책 (14개)

- **상품** — 읽기 공개(비로그인도 목록 조회) / 등록·수정·삭제는 `auth.uid() = user_id`
- **관심** — 카운트 표시를 위해 읽기 공개 / 추가·삭제는 본인만
- **채팅방** — 참여자(구매자·판매자)만 조회 / 개설은 구매자만, 이때 `seller_id`가 **실제 상품 주인과 일치**해야 통과 (판매자 위조 차단)
- **메시지** — 참여 중인 방만 읽기 / 본인 명의로만 전송
- **Storage** — 누구나 이미지 조회 / 업로드·삭제는 `<본인 uid>/` 폴더에만

---

## 검증 결과

기능은 브라우저에서 실제로 클릭해서, 보안은 API를 직접 때려서 확인했습니다.

**기능 (Playwright 실행)**
- 로그인 → 동네 온보딩 → 상품 등록(이미지 2장 실제 업로드) → 목록 → 카테고리 필터 → 키워드 검색 → 상세 → 관심 → 채팅방 개설 → 메시지 송수신 → 마이페이지 3탭
- 이미지가 Storage `<uid>/` 경로에 저장되고 공개 URL이 `200 image/png`로 응답하는 것까지 확인
- **폴링**: 페이지를 열어둔 채 외부에서 메시지를 넣으면 새로고침 없이 화면에 등장 ✅

**빌드 중 발견해 고친 버그**

| 증상 | 원인 | 수정 |
|---|---|---|
| 상품등록 화면에서 사진 버튼이 안 눌림 | 하단 고정 바에 `.app-shell` 재사용 → `min-height:100vh`를 물려받아 바가 화면 전체를 덮고 클릭을 가로챔 | `.app-bar` 분리 |
| 좁은 화면에서 FAB가 엉뚱한 곳에 | `left: calc(50% + 240px - 76px)` 하드코딩 | 중앙정렬 래퍼로 교체 |
| **가입 성공했는데 온보딩에 갇힘** | 프로필을 넣어도 `AuthProvider`의 `profile`이 `null`이라 라우터가 온보딩으로 보냄. `reloadProfile`이 렌더 시점의 `session`(=null)을 클로저로 잡은 것도 원인 | 가입 후 `reloadProfile()` 호출 + `getSession()`으로 세션 직접 조회 |
| 온보딩 재제출 시 PK 중복 오류 | `insert` | `upsert` |

> 마지막 두 개는 **메일 인증을 끄면서 처음 열린 경로**입니다. 인증이 켜져 있을 땐 가입 직후 세션이 없어
> 이 코드가 아예 실행되지 않았습니다. 시연 영상을 녹화하다 발견했습니다.

**RLS 격리 (제3자 계정으로 공격 시도) — 7/7 차단**

| 시도 | 결과 |
|---|---|
| 남의 상품 수정 | ✅ 차단 (0건) |
| 남의 상품 삭제 | ✅ 차단 (0건) |
| 남의 채팅방 조회 | ✅ 차단 (빈 배열) |
| 남의 채팅 메시지 조회 | ✅ 차단 (빈 배열) |
| 남의 방에 메시지 주입 | ✅ 차단 (RLS 위반) |
| 남의 명의로 상품 등록 | ✅ 차단 (RLS 위반) |
| 비로그인 목록 조회 | ✅ 정상 노출 (의도된 공개 읽기) |

---

## 로컬 실행

```bash
python3 -m http.server 8899
# http://localhost:8899
```

빌드 도구·의존성 설치가 없습니다. `index.html` 하나면 끝입니다.

---

## 제출물

| 파일 | 내용 |
|---|---|
| `screenshots/` | 화면 6종 (440×880) — 로그인·홈·등록·상세·채팅·마이페이지 |
| `demo/시연영상_당근마켓클론.webm` | **시연 영상 37.7초** — 배포 URL 기준, 가입 → 상품등록(사진 2장) → 검색 → 관심 → 채팅 → 마이페이지 |
| `demo/에이전트_대화기록_당근마켓.png` | 에이전트 대화 기록 (지시 → 빌드 → 버그 발견 → 수정 반복) |
| `공유안내.md` | 타인 가입 & 채팅 인증용 공유 문구와 절차 |

> 시연 영상은 Playwright 헤드리스 녹화로 만들었습니다 — 실제 배포된 앱을 실제로 조작한 화면이며,
> 편집이나 합성 없이 한 번에 끝까지 돌아간 세션 그대로입니다.

---

## 운영 메모 — 이메일 확인은 꺼둠 ✅

가입 즉시 로그인되도록 **`mailer_autoconfirm = true`** 로 설정했습니다.
켜져 있으면 가입자마다 확인 메일이 나가고, 무료 등급에선 곧 `over_email_send_rate_limit`가 납니다.

대시보드(Authentication → Providers → Email → Confirm email) 말고 **Management API로도 바꿀 수 있습니다**:

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/<project-ref>/config/auth" \
  -H "Authorization: Bearer <sbp_ 액세스 토큰>" \
  -H "Content-Type: application/json" \
  -d '{"mailer_autoconfirm": true}'
```

설정 후 **완전 신규 계정으로 전 구간 재검증 완료** — 가입 → 프로필(닉네임·동네) → 채팅방 개설 → 메시지 전송 → 찜까지 SQL 우회 없이 통과.

---

## 남은 작업 (제출 전)

- [ ] 시연 영상 1분 이내 (가입 → 상품 등록 → 검색 → 채팅)
- [ ] 본인 외 1명 이상 실제 가입 & 채팅 스크린샷
- [ ] 에이전트 대화 스크린샷
