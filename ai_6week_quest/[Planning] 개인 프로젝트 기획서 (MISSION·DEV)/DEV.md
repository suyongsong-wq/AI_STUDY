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

### Phase 1 — 디자인 / 프로토타입
- [ ] Leaflet 세계 지도 화면(줌·팬)
- [ ] 방문지 핀 + 국가 색칠 UI(더미 데이터)
- [ ] 다이어리 카드 레이아웃(목업)
- **✅ 체크포인트**: 로그인 없이도 지도에 더미 방문지가 찍히고 다이어리 카드가 보인다.

### Phase 2 — 기본 기능 (MVP 핵심)
- [ ] Supabase Auth 로그인/회원가입
- [ ] 방문지 추가: 지도 클릭·도시 검색 → `places` 저장
- [ ] 방문 국가 자동 색칠(스크래치 맵)
- [ ] 지역별 다이어리 작성/조회 + 사진 업로드(Storage)
- [ ] RLS: 본인 데이터만 읽기/쓰기
- **✅ 체크포인트**: 로그인 → 내 방문지 저장·색칠 → 다이어리 작성/조회까지 동작.

### Phase 3 — 어려운 기능
- [ ] 가족·친구 공유(멤버 초대 → 공동 지도, RLS 권한)
- [ ] 구글 Places API 평점 연계(장소 검색 → 평점 표시, 서버 함수)
- [ ] 체크인 기반 방문 순서 경로(라인) — GPS 자동추적 대체
- **✅ 체크포인트**: 친구를 초대해 같이 지도를 채우고, 장소 평점이 뜬다.

### Phase 4 — 마무리
- [ ] 통계(방문 국가 수·대륙 진행률 %)
- [ ] 빈 상태/에러 처리·반응형
- [ ] Vercel 배포 + README
- **✅ 체크포인트**: 배포 URL에서 로그인→지도→다이어리→공유 전체 플로우 동작.

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
