// 공유 코어: 카페 데이터 → Gemini(실제 LLM)로 "오늘의 카페 브리핑" 생성
// api/brief.js(Vercel 서버리스)와 server.js(로컬 dev)가 함께 사용.

const MODEL = 'gemini-2.5-flash';

const SYSTEM = `너는 성수동 '하버스카페' 사장님을 돕는 데이터 분석 비서다.
주어진 카페 운영 데이터(매출·인기메뉴·리뷰)와 오늘 날씨를 종합해 "오늘의 카페 브리핑"을 작성한다.
규칙:
- 한국어, 3~4문장, 따뜻하지만 군더더기 없이.
- "좋은 아침, 하버스카페 사장님!"으로 시작.
- 매출 추세(전일 대비)·인기 메뉴·리뷰(평점/불만)를 자연스럽게 녹인다.
- 날씨를 근거로 오늘 실행할 액션 1가지를 구체적으로 추천한다(예: 비 예보→디저트 세트 픽업 강조).
- 숫자는 실제 데이터만 사용하고 지어내지 않는다.`;

export async function generateBriefing(data, apiKey) {
  const key = (apiKey || '').trim();
  if (!key) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

  const userText = `아래는 오늘 종합할 카페 데이터(JSON)야. 이걸로 "오늘의 카페 브리핑"을 써줘.\n\n${JSON.stringify(data, null, 2)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 500,
      thinkingConfig: { thinkingBudget: 0 }, // 2.5-flash thinking 비활성화(잘림 방지)
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Gemini API error:', resp.status, errText);
    if (resp.status === 429) throw new Error('Gemini 무료 사용량 한도를 초과했어요. 잠시 후 다시 시도해 주세요.');
    if (resp.status === 400 || resp.status === 403) throw new Error('Gemini API 키가 잘못되었거나 권한이 없어요.');
    throw new Error('AI 브리핑 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
  }

  const json = await resp.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI가 빈 응답을 보냈어요.');
  return text.trim();
}
