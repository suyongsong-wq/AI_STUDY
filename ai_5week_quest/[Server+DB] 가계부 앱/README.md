# 📜 [Server+DB] 가계부 앱

> 🎯 **Server + DB(Supabase)**를 조합해 나만의 가계부 앱 만들기
> 구분: 🚩퀘스트 · 제출 기한: 토요일 23:59 PM

## 미션
1. 수입/지출 내역 등록 (날짜·금액·카테고리·메모)
2. 등록된 내역 목록 조회
3. 카테고리별 합계 표시 (식비·교통·주거·구독료·경조사 등)
4. 모든 데이터는 Supabase DB에 저장

## 핵심 구조
```
[입력 (금액·카테고리·메모)] → [Server] → DB에 수입/지출 저장 → 내역 조회 & 카테고리별 합계 → 결과 응답
```
- **DB 역할**: 수입/지출 저장소 + 카테고리별 통계 조회
- **Server 역할**: CRUD API (등록·조회·수정·삭제)

## 제출물
- GitHub 저장소 링크 (코드 포함)
- 동작 스크린샷 (최소 1장)
- 에이전트 대화 스크린샷 (최소 1장)

## 포인트 기준
| 항목 | 포인트 | 기준 |
|---|---|---|
| 기본 완료 | 10pt | 제출물 기한 내 제출 |
| 에이전트 활용 | 5pt | 2회 이상 대화하며 개선 |
| 창의성 | 5pt | 월별 리포트·차트·예산 알림 등 |
| 공유 보너스 | 5pt | 단톡방 공유 + 리액션 |

→ 기본 10 / 기본+활용·창의 15~20 / 올클리어 **25pt**

## 팁
- 테이블 컬럼: `type`(수입/지출), `category`, `amount`, `memo`, `date`
- 카테고리별 합계는 SQL `GROUP BY` 활용
- 여유 되면 월별 지출 차트·예산 대비 사용량 도전

---

## ✅ 제출 결과물 (완료)
- **배포 URL**: https://household-ledger-app-navy.vercel.app
- **실행 화면**: `실행화면_스크린샷.png`
- **구성**: `server.js`(Express + pg, CRUD + 카테고리 합계) · `index.html`(React+Tailwind CDN, 단일 파일) · `vercel.json` · `.env`
- **DB**: 공용 Supabase `household_ledger` 테이블 (수입/지출 샘플 18건 시드)
- **API**: `POST/GET /api/transactions`, `GET /api/summary`, `DELETE /api/transactions/:id`
- **창의성(5pt)**: 카테고리별 지출 막대 시각화 + **이번 달 예산 대비 알림**(진행률 막대·80% 경고·초과 시 빨간 알림, 예산 localStorage 저장)
- **대화내용**: `[Server+DB] 가계부 앱 대화내용.txt` · `대화내용_스크린샷.png`
- 빌드: single-server-specialist(server.js) + single-react-dev(index.html) 에이전트로 작성
