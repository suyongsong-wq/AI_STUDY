# 🧭 Trailmark — 여행 기록 지도

> **"Fill the world map with your own memories."**
> 세계 지도를 스크래치 맵처럼 긁으며 여행의 기억을 영구 보관하는 앱.

**🌐 https://trailmark.co.kr** — 지금 바로 사용 가능 (모바일 지원)

## [Final] 제출물

| 항목 | 위치 |
| --- | --- |
| 배포 URL | https://trailmark.co.kr (Vercel + 가비아 도메인) |
| 발표용 썸네일 (1920×1080) | `제출/썸네일_1920x1080.png` |
| 데모 영상 (29초) | `제출/데모영상.mp4` |
| 발표자료 (11장) | `제출/발표자료.html` — 브라우저로 열어 ←→ 넘기기 |
| 회고 | `제출/회고.md` |

여행 추억은 인스타 스토리(24시간), 사진첩, 머릿속으로 흩어져 휘발된다.
Trailmark는 다녀온 나라를 지도에서 '긁고', 도시별 다이어리·사진을 남기고,
가족·친구와 지도를 공유해 **흩어진 여행의 순간을 한 곳에** 모은다.

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| 🗺️ 스크래치 맵 | 미방문국은 은박, 방문국은 대륙별 컬러로 '긁힌' 표현. 실사 지도(OSM 타일) 토글 |
| 🖱️ 국경 하이라이트 | 커서를 올리면 실제 국경 모양대로 하이라이트 + 국가명 |
| 📍 방문지 추가 | 지도에서 나라 클릭 → 도시 자연어 검색(도시 DB 캐시 + OSM Nominatim) → 정확한 좌표에 핀 |
| 📔 여행 다이어리 | 도시별 글·사진 기록, 나중에 수정/작성 가능. 포스트카드형 카드 UI |
| 👨‍👩‍👧 가족·친구 공유 | 이메일 초대 → 서로의 지도 보기(보기 전용). 함께 보기 모드 |
| ✈️ 여행 경로 | 방문일 순서대로 점선 경로 라인 |
| ⭐ 구글 평점 | Edge Function 프록시 + 캐시 (API 키 연결 시 동작) |
| 📊 통계 | 방문 국가 수 · 도시 기록 수 · 대륙 진행률 % |

## 기술 스택

- **프론트**: 단일 `index.html` — React 18 (UMD) + Tailwind CDN + Babel standalone, 빌드 도구 없음
- **지도**: Leaflet 1.9.4 + OpenStreetMap 타일 + world GeoJSON (무료, API 키 불필요)
- **지오코딩**: OSM Nominatim (자연어 도시 검색, 한글 지원) + `tm_cities` 캐시 테이블
- **백엔드**: Supabase — Auth(이메일) · Postgres(+RLS) · Storage(`trip-photos`) · Edge Function(`places-rating`)
- **폰트**: Outfit(디스플레이) + Pretendard(한글 본문)
- **배포**: Vercel (정적)

## DB 스키마

```
tm_places        방문지 (user_id, country, country_ko, flag, continent, city, lat, lng, visited_at)
tm_diary_entries 다이어리 (place_id, title, body, photo_url)
tm_cities        도시 검색 캐시 (osm_id unique, name, lat, lng, hits)
tm_shares        공유 (owner_id, member_id) — RLS로 조회 권한 확장
tm_ratings       구글 평점 캐시 (place_id, rating, user_rating_count)
storage:         trip-photos/{auth.uid()}/{파일명}
```

- **RLS**: 방문지·다이어리는 본인 + 공유받은 사람만 조회, 쓰기는 본인만
- **보안 함수**: `tm_find_user`(이메일→id), `tm_share_list`(공유 목록) — `auth.users` 직접 노출 없음
- Storage 쓰기는 본인 `auth.uid()` 폴더만 허용

## 구글 평점 (선택 기능)

`rating` 필드는 Places API(New) **Enterprise SKU**($20/1,000회, 무료 월 1,000회).
방문지당 1회만 호출하고 `tm_ratings`에 캐시하므로 실사용 비용은 사실상 0원.
활성화하려면 Supabase Edge Functions Secrets에 `GOOGLE_PLACES_KEY`만 추가하면 된다 (코드 수정 불필요).
키는 서버(Edge Function)에만 존재 — 프론트 노출 없음.

## 실행

배포 URL로 접속하거나, 로컬에서:

```bash
python3 -m http.server 8791   # 이 폴더에서
# → http://localhost:8791/index.html
```

로그인 후 `＋ 방문지 추가` → 지도에서 나라 클릭 → 도시 검색 → 저장.

## 개발 기록

- Phase 1 — Leaflet 지도 + 스크래치/실사 토글 + 국경 hover (더미 데이터)
- Phase 2 — Auth + 방문지/다이어리/사진 + RLS + 도시 자연어 검색
- Phase 3 — 공유(RLS 확장) + 여행 경로 + 구글 평점 구조
- Phase 4 — 리뷰(XSS·누수·고아 파일 등 10건 수정), 다이어리 수정 기능, 배포

상세 기획: `ai_6week_quest/[Planning] 개인 프로젝트 기획서 (MISSION·DEV)/`
