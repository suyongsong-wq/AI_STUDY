// ========================================
// 마음 상담소 — 심리상담 채팅 서버
// Node.js 내장 모듈만 사용 (의존성 설치 불필요)
//   - http   : 정적 파일 서빙 + API 엔드포인트
//   - https  : OpenAI Chat Completions API 호출
//   - fs/path: index.html 읽기
// 실행: node server.js  →  http://localhost:3456
// ========================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------
// 설정
// ---------------------------------------
const PORT = process.env.PORT || 3456;

// API 키는 서버에서만 사용 (클라이언트에 절대 노출 금지)
// 반드시 환경변수 OPENAI_API_KEY 로 주입 (코드에 하드코딩 금지)
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
}

const OPENAI_MODEL = 'gpt-4o-mini';

// 상담사 "김다온" 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 "김다온"이라는 이름의 따뜻하고 공감적인 한국어 심리상담사입니다.

[역할과 태도]
- 내담자의 이야기를 진심으로 경청하고, 감정을 있는 그대로 공감하며 받아들입니다.
- 판단하거나 가르치려 하지 않고, 내담자가 스스로 마음을 들여다볼 수 있도록 부드럽게 곁에서 함께합니다.
- 따뜻하고 다정한 말투를 사용하되, 과하지 않고 진솔하게 이야기합니다.

[지켜야 할 원칙]
- 의학적 진단이나 처방(예: 특정 질환 단정, 약물 권유)은 절대 하지 않습니다.
- 섣부른 조언이나 해결책 제시보다는, 경청과 공감, 그리고 마음을 열 수 있는 부드러운 질문을 우선합니다.
- 내담자의 감정을 먼저 충분히 반영(reflection)한 뒤, 더 이야기를 이어갈 수 있는 열린 질문을 한두 개 건넵니다.
- 답변은 한국어로, 보통 2~4문장 정도로 따뜻하고 간결하게 작성합니다.

[위기 상황]
- 자해, 자살, 타인을 해치려는 생각 등 위급한 신호가 보이면, 진심 어린 공감과 함께 전문기관(예: 정신건강 위기상담전화 1577-0199, 자살예방상담전화 109)에 연락하도록 부드럽게 안내합니다.`;

// ---------------------------------------
// OpenAI Chat Completions 호출 (https 모듈)
// ---------------------------------------
function callOpenAI(messages) {
  return new Promise((resolve, reject) => {
    // 클라이언트 메시지 앞에 시스템 프롬프트를 항상 추가
    const payload = JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.8,
      max_tokens: 500,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const msg = (json.error && json.error.message) || `OpenAI API 오류 (status ${res.statusCode})`;
            return reject(new Error(msg));
          }
          const reply = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (!reply) return reject(new Error('OpenAI 응답에서 메시지를 찾을 수 없습니다.'));
          resolve(reply.trim());
        } catch (e) {
          reject(new Error('OpenAI 응답 파싱 실패: ' + e.message));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------
// 요청 본문(JSON) 읽기 헬퍼
// ---------------------------------------
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // 과도하게 큰 본문 방어 (1MB)
      if (data.length > 1e6) {
        reject(new Error('요청 본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('잘못된 JSON 형식입니다.'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------
// 일관된 JSON 응답 헬퍼
// ---------------------------------------
function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ---------------------------------------
// 정적 파일 서빙 (index.html)
// ---------------------------------------
function serveIndex(res) {
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('index.html을 찾을 수 없습니다.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
}

// ---------------------------------------
// 라우팅
// ---------------------------------------
const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];

  // POST /api/chat — OpenAI 응답
  if (req.method === 'POST' && url === '/api/chat') {
    try {
      const body = await readJsonBody(req);
      const messages = body.messages;

      // 입력 검증
      if (!Array.isArray(messages) || messages.length === 0) {
        return sendJson(res, 400, {
          success: false,
          message: 'messages 배열이 필요합니다.',
        });
      }

      // role/content 형태로 정규화 (안전하게 필터링)
      const cleaned = messages
        .filter((m) => m && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }));

      if (cleaned.length === 0) {
        return sendJson(res, 400, {
          success: false,
          message: '유효한 메시지가 없습니다.',
        });
      }

      const reply = await callOpenAI(cleaned);
      return sendJson(res, 200, { success: true, data: { reply } });
    } catch (err) {
      console.error('[POST /api/chat] 오류:', err.message);
      return sendJson(res, 500, {
        success: false,
        message: '상담사 응답을 가져오는 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.',
      });
    }
  }

  // GET / 또는 /index.html — 정적 파일
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    return serveIndex(res);
  }

  // 그 외 — 404
  sendJson(res, 404, { success: false, message: '요청하신 경로를 찾을 수 없습니다.' });
});

server.listen(PORT, () => {
  console.log(`마음 상담소 서버 실행 중 → http://localhost:${PORT}`);
});

module.exports = server;
