# DEV — 여행 기록 지도 앱 (가칭: Trailmark)

> 어떻게 만들 것인가. MISSION.md의 "무엇을·왜"를 실제 개발 지도로.
> 관련: [MISSION.md](./MISSION.md)

---

## ① 개발 구조 선택 — **Supabase 기반**

로그인(누가 어디 갔는지)·DB(방문지·다이어리)·Storage(사진)·공유(가족·친구 권한 제어)가 모두 필요하므로 **Supabase 기반**을 선택.

| 레이어 | 기술 | 이유 |
| --- | --- | --- |
| 프론트 | `index.html` (React CDN + Tailwind) | 빌드 도구 없이 빠르게, 카페 대시보드에서 검증된 패턴 |
| 지도 | **Leaflet + OpenStreetMap** | 무료·API 키 불필요. 세계 지도 + 방문지 핀·색칠에 충분 |
| 인증 | Supabase Auth (이메일) | 로그인해야 내 지도·다이어리 접근 |
| DB | Supabase Postgres (+ RLS) | 방문지·다이어리·공유 멤버. RLS로 "내 것/공유된 것만" |
| 파일 | Supabase Storage | 여행 사진 업로드 |
| 서버 함수 | Vercel 서버리스 (`/api/*`) | 구글 Places 키를 프론트에 노출하지 않기 위해 |
| 배포 | Vercel | 대시보드와 동일 파이프라인 |

**대안 비교**
- 단일 파일(localStorage): 공유·다중 기기 불가 → 탈락
- Next.js 풀스택: MVP엔 과함 → 7주차 이후 확장 시 고려

### DB 스키마(초안)
```
profiles(id, email, display_name)
places(id, user_id, country, city, lat, lng, visited_at, cover_photo)   -- 방문지
diary_entries(id, place_id, user_id, title, body, created_at)           -- 지역별 일기
photos → Supabase Storage 버킷(trip-photos)
shares(map_owner_id, member_id, role)  -- 가족·친구 공유(RLS 기준)
```
데이터 흐름: `로그인 → 지도 클릭/검색으로 방문지 추가 → 국가 색칠 + 다이어리·사진 → (조건부)구글 평점 → 가족·친구 초대 공유`

---

## ② TODO 리스트 (Phase별 + 체크포인트)

### Phase 1 — 디자인 / 프로토타입  ✅ 완료 (2026-07-19)
- [x] Leaflet 세계 지도 화면(줌·팬) — OSM 타일, `worldCopyJump`, `invalidateSize`로 flex 높이 보정
- [x] 방문지 핀 + 국가 색칠 UI(더미 데이터) — 5개국(한·일·프·태·미) 커스텀 divIcon 핀 + GeoJSON 색칠
- [x] **스크래치 맵 / 실사 지도 토글(온·오프)** — ①스크래치: 딥네이비 바다 + 미방문 은박(회색) + 방문국 대륙별 컬러로 '긁어낸' 표현 + 국가명 라벨 ②실사: OSM 타일 + 방문국 teal 강조. 타일 opacity 토글로 전환
- [x] **국경 모양 hover 하이라이트** — 네모 박스가 아니라 GeoJSON 폴리곤(실제 국경선)에 mouseover 시 파란 하이라이트 + 국가명 표시, mouseout 시 현재 모드 스타일로 복구. 방문국은 클릭 시 해당 다이어리 선택
- [x] 다이어리 카드 레이아웃(목업) — 사이드바 카드 5장 + 통계(방문국/도시/대륙 진행률) + 클릭 시 지도 flyTo·핀 하이라이트·상세 패널
- **✅ 체크포인트 통과**: 로그인 없이 지도에 더미 방문지 5곳 표시 + 국가 색칠 + 다이어리 카드/상세 동작 확인.
- 산출물: `ai_7week_quest/[Final] 여행 기록 지도 앱 (Trailmark)/index.html` (단일 파일, React CDN)

### Phase 2 — 기본 기능 (MVP 핵심)  ✅ 완료 (2026-07-19)
- [x] Supabase Auth 로그인/회원가입 — 프론트온리 supabase-js, 5주차와 **같은 프로젝트**(`ibxhnwovdtnfttfzqpos`) + publishable 키
- [x] 방문지 추가 → `tm_places` 저장 — **도시 검색 대신 "지도에서 국가 클릭"** 방식으로 구현(스크래치 맵 은유에 더 맞음). 클릭한 GeoJSON feature의 ISO3로 한글명·국기·대륙 자동 매핑(META 51개국, 그 외 영문명+🌍)
- [x] 방문 국가 자동 색칠(스크래치 맵) — DB의 `continent` 기준 대륙별 컬러로 '긁어냄'
- [x] 지역별 다이어리 작성/조회 + 사진 업로드 — `tm_diary_entries` + Storage 버킷 `trip-photos`(공개 읽기 / 쓰기는 `auth.uid()` 폴더만)
- [x] RLS: 본인 데이터만 읽기/쓰기 — 두 테이블 각 4정책(select/insert/update/delete)
- **✅ 체크포인트 통과**: 로그인 → 국가 클릭으로 방문지 저장 → 지도 색칠 + 핀 + 통계 → 다이어리 카드/상세 조회까지 실제 동작 확인.

**Phase 2 스키마(실제 적용)** — 공용 프로젝트라 `tm_` 프리픽스
```
tm_places(id, user_id=auth.uid(), country, country_ko, flag, continent, city, lat, lng, visited_at, created_at)
          unique(user_id, country, city)
tm_diary_entries(id, place_id→tm_places, user_id=auth.uid(), title, body, photo_url, created_at)
storage: trip-photos/{auth.uid()}/{파일명}
```

**검증 결과**
| 항목 | 결과 |
| --- | --- |
| 실제 저장(중국·홍콩 "홍콩 여행") | 통계 1국/1도시/14%, 중국 teal 색칠 + 라벨 + 핀 1개 ✓ |
| RLS — 본인 | 1건 조회 ✓ |
| RLS — 타 사용자 / 비로그인 | 0건 (places·diaries 모두) ✓ |
| Storage — 본인 폴더 업로드 | 허용 ✓ |
| Storage — 남의 폴더 업로드 | RLS violation으로 차단 ✓ |

### Phase 3 — 어려운 기능  ✅ 완료 (2026-07-19, 평점은 키 대기)
- [x] 가족·친구 공유 — `tm_shares` + 이메일 초대. `auth.users`를 직접 노출하지 않도록 보안 함수 2개(`tm_find_user`, `tm_share_list`)로 처리. 사이드바 지도 선택기(내 지도 / 함께 보기 / OO의 지도), 남의 지도는 **보기 전용**
- [x] 체크인 기반 방문 순서 경로 — `✈️ 여행 경로` 토글 시 방문일 순 점선 폴리라인
- [x] 구글 Places 평점 — **구조 완성, API 키만 대기**. Edge Function `places-rating`(키 서버 보관) + `tm_ratings` 캐시 + 상세 패널 UI. 키 없으면 안내 문구 표시
- **✅ 체크포인트 통과**: 초대 → 공유 지도 조회 동작. 평점은 키 연결 시 즉시 동작.

**공유 RLS 검증**
| 단계 | 결과 |
| --- | --- |
| 공유 전 · 타 사용자가 보는 방문지 | 0건 |
| 공유 후 · 멤버가 보는 방문지 / 다이어리 | 3건 / 3건 ✓ |
| 제3자 | 0건 ✓ |
| 멤버가 남의 방문지 삭제 시도 | 0건(차단) ✓ |
| 실제 초대(UI) | `suyong → minsu` DB 반영 ✓ |

**구글 평점 비용 (2026-07 공식 문서 확인)**
- `rating`·`userRatingCount`는 **Enterprise SKU** — Place Details Enterprise **$20.00/1,000회**, Text Search Enterprise $35.00/1,000회
- 무료 한도: Enterprise **월 1,000회** (Pro 5,000 / Essentials 10,000). 2025-03부터 $200 크레딧 → SKU별 한도로 변경
- **방문지당 1회만 호출 후 `tm_ratings`에 캐시** → 실사용 비용 사실상 0원. 단 **GCP 결제 계정(카드) 등록은 필수**
- 키 연결 방법: Supabase 프로젝트 secrets에 `GOOGLE_PLACES_KEY` 추가 (프론트엔 절대 넣지 않음)

### Phase 4 — 마무리  ✅ 완료 (2026-07-19)
- [x] 통계(방문 국가 수·대륙 진행률 %) — Phase 2에서 선반영 (스탬프 타일 + 진행 바)
- [x] 빈 상태/에러 처리·반응형 — Fable 5 리뷰로 결함 10건 수정(XSS 이스케이프, 사진 유실, scope 잔류 갇힘, 지도 인스턴스/리스너 누수, GeoJSON 실패 "다시 시도", Storage 고아 파일 삭제, 검색 중복, 로드 실패 안내, flyTo 튐, favicon 404) + **다이어리 수정/쓰기 모달** 추가
- [x] Vercel 배포 + README — **https://trailmark-rho.vercel.app** (프로젝트 `trailmark`, 계정 suyongsong-6952)
- **✅ 체크포인트 통과**: 배포 URL에서 로그인 → 데이터 로드(3개국/4도시 14%) → 지도 색칠 3개국 + 핀 4개 + 카드 4장 렌더 확인. 콘솔 에러 0.

## 최종 산출물
- 앱: `ai_7week_quest/[Final] 여행 기록 지도 앱 (Trailmark)/index.html` (단일 파일)
- 배포: https://trailmark-rho.vercel.app
- README: 같은 폴더 `README.md`
- 데모 계정: suyong.song@griff.co.kr

---

## ③ 외부 설정 필요 항목

| 항목 | 용도 | 발급처 | 환경변수 | 노출 위치 |
| --- | --- | --- | --- | --- |
| Supabase URL | 프로젝트 주소 | supabase.com | `SUPABASE_URL` | 프론트 OK |
| Supabase publishable key | Auth·DB·Storage(RLS 보호) | supabase.com | `SUPABASE_ANON_KEY` | 프론트 OK |
| Supabase Storage 버킷 | 사진 저장 | supabase(콘솔) | `trip-photos` | — |
| Google Places API 키 | 장소 평점·검색 | Google Cloud Console | `GOOGLE_PLACES_KEY` | **서버 only** |
| (지도 타일) Leaflet+OSM | 세계 지도 | 무료·키 없음 | — | 프론트 |
| Vercel | 배포·서버리스 | vercel.com | — | — |

> 🔐 원칙: `GOOGLE_PLACES_KEY`·service role 키는 **서버리스 함수 환경변수**로만. 프론트엔 publishable(anon) 키만.

---

## 구현 순서 요약
Phase 1(지도 프로토) → Phase 2(로그인·방문지·다이어리 = MVP) → Phase 3(공유·평점) → Phase 4(통계·배포).
**7주차엔 Phase 2까지가 최소 목표**(로그인 + 스크래치 맵 + 다이어리), Phase 3는 여유 시.
