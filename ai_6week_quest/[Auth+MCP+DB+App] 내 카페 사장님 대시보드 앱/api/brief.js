// Vercel 서버리스 함수: POST /api/brief
// 클라이언트가 종합한 카페 데이터를 받아 Gemini(실제 LLM)로 브리핑 생성.
// GEMINI_API_KEY는 Vercel 환경변수에 등록(프론트에 키 노출 안 함).
import { generateBriefing } from '../lib/generateBriefing.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 허용됩니다.' });
    return;
  }
  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const briefing = await generateBriefing(data, process.env.GEMINI_API_KEY);
    res.status(200).json({ briefing });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI 브리핑 생성 실패' });
  }
}
