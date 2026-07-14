# 🐹 G1. YouTube 썸네일 만들기 (1920×1080) — 15pt (+5)

> 🎯 내가 좋아하는 유튜버의 영상 썸네일을 1920×1080으로 만들어보기

## 1. 대상 영상

| 항목 | 내용 |
|---|---|
| 채널 | **OOOffi** (구독자 2.27만명) · [채널](https://www.youtube.com/channel/UCl9gRpU_fQAeuPAn7ma_DOQ) |
| 영상 | 𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 \| 올여름 내내 듣게 될 시원한 청량팝 모음🐶🩵 첫 곡부터 기분 좋아지는 여름 플리👙 카페음악 • 노동요 |
| URL | https://youtu.be/DwlYkGuixsw |
| 로케이션 | 📍 Backyard Pool, Palm Springs, California, USA |
| 앨범 | 133집 **"Own the Day"** (전곡 채널 자작곡) |

## 2. 레퍼런스 스타일 분석

퀘스트 팁 — *"실제 썸네일을 레퍼런스로 옆에 띄워두고 따라 만들어보세요"* — 에 따라 원본 썸네일(`레퍼런스/원본_썸네일.jpg`)을 먼저 해부했다.

| 요소 | 원본 |
|---|---|
| 배경 | 수영장 풀블리드 사진, 고채도 시안 |
| 헤드라인 | 거대한 **Didone 세리프 소문자** (`playlist`) — 한국식 굵은 고딕이 아님 |
| 상단 라벨 | `WHERE : Blue Pool` — 얇은 산세리프, 넓은 자간 |
| 브랜드 | `OOOffi` 타원 아웃라인 배지 + 이탤릭 태그라인 `Out of Office, into the Music.` |
| 하단 | 트랙리스트 2줄, 아주 작게 |
| 강조색 | **없음** (전부 흰색) |

**핵심 판단**: 이 채널 톤은 "빨강·노랑 강조색 + 두꺼운 고딕"이라는 일반적 유튜브 썸네일 공식과 정반대다. 그래서 톤은 레퍼런스를 따르되, 퀘스트 요구사항인 **"핵심 키워드 1~2개에만 강조색"**은 헤드라인 **한 단어에만** 적용해 두 요구를 모두 만족시켰다.

## 3. 제작 방식 — 생성형 이미지

배경은 **Pollinations.ai**(API 키 불필요·무료, flux 모델)로 생성했다.

> 이 선택의 근거: **채널 설명란에 제작 방식이 명시돼 있다.**
> `📸Change the picture imported from @Unsplash @pinterest @Midjourney @nanobanana`
> 즉 이 채널은 실제로 **Midjourney·nanobanana(Gemini 2.5 Flash Image)** 로 배경을 만든다. 생성형 이미지 접근이 원작자의 실제 워크플로와 일치한다.

- 시도했으나 불가했던 경로: `gemini-2.5-flash-image` → **429 RESOURCE_EXHAUSTED**(무료 티어 이미지 쿼터 0), OpenAI GPT Image → **키 없음**
- Pollinations 무료 티어는 출력이 1024×576으로 캡 → **최종 합성 캔버스를 1920×1080으로 잡고** 배경 레이어로 사용해 규격을 정확히 충족
- 타이포 합성: HTML/CSS + Playwright 1920×1080 뷰포트 스크린샷
- 폰트: **Didot**(macOS 로컬 — 레퍼런스와 동일 계열 Didone) + **Pretendard**(한글)

## 4. 결과물 — A/B 두 버전 (보너스 +5pt)

| | **A — summer pop** | **B — cool down** |
|---|---|---|
| 파일 | `썸네일_A_summer-pop_1920x1080.png` | `썸네일_B_cool-down_1920x1080.png` |
| 배경 | 수영장 속 골든리트리버 (원본 컨셉 계승) | 골든아워 풀사이드 + 야자수 |
| 라벨 | WHERE : BACKYARD POOL, PALM SPRINGS | WHERE : POOLSIDE, 5PM |
| 헤드라인 | summer **pop** | cool **down** |
| 강조색 | `#FFD84D` (시안 보색 대비) | `#FFC24A` (동일 계열 웜) |
| 한글 카피 | 첫 곡부터 기분 좋아지는 여름 플리 | 올여름 내내 듣게 될 청량팝 모음 |

### 어떤 게 더 클릭하고 싶은가 → **A**

`검증_300x170/`에 실제 축소본을 만들어 비교한 결과:

- **A 승**: 시안 배경 위 노란 `pop`이 보색 대비로 튄다. 300×170으로 줄여도 헤드라인이 또렷하고, 웃는 강아지 얼굴이 시선을 잡는다.
- **B 패**: 배경이 골든아워 웜톤이라 노란 `down`이 **배경에 묻힌다.** 축소하면 강조가 사실상 소실된다.
- **배운 것**: 강조색은 색 자체가 아니라 **배경과의 대비**로 결정된다. 같은 노랑이어도 시안 위에선 강조가 되고 골든아워 위에선 노이즈가 된다.

## 5. 규격 검증

| 체크 | 결과 |
|---|---|
| 1920×1080 (16:9) | ✅ 두 버전 모두 `sips` 확인 — pixelWidth 1920 / pixelHeight 1080 |
| 영상 주제가 한눈에 | ✅ `summer pop` + 한글 부제 |
| 강조색 + 이미지 합성 | ✅ 헤드라인 1단어 강조 + 생성 이미지 풀블리드 |
| 300×170 축소 가독성 | ✅ `검증_300x170/` — A는 완전 판독, B는 강조색 손실(위 결론의 근거) |

## 6. 데이터 출처

- **트랙리스트는 실제 영상 설명란에서 가져왔다** (133집 "Own the Day"): Own the Day · Ocean, Still Calling · Cool Summer · Fresh Dive · Sparkling Wave · Cool Breeze · Ice Blue · Cool Ocean Heart · Ocean Spark · Fresh Coast · Summer Soda · Cafe Glow · replay
- 채널명·구독자수·로케이션·앨범명 모두 크롬 MCP로 실제 페이지에서 수집. **지어낸 값 없음.**

## 7. 파일 구조

```
[Goblin] YouTube 썸네일 만들기/
├── README.md
├── 썸네일_A_summer-pop_1920x1080.png   ← 최종 A
├── 썸네일_B_cool-down_1920x1080.png    ← 최종 B (보너스)
├── 레퍼런스/원본_썸네일.jpg              ← 원작자 썸네일 (스타일 분석용)
├── 생성이미지/                          ← Pollinations 생성 배경 원본
│   ├── A_수영장_강아지.jpg
│   └── B_썬베드_야자수그림자.jpg
├── 검증_300x170/                       ← 축소 가독성 검증
└── 제출_스크린샷/
```
