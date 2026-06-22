// ============================================================
//  server.js
//  Node.js 내장 http 모듈만 사용하는 간단한 백엔드 서버
//
//  [실행 방법]
//    1) 터미널에서 이 폴더로 이동
//    2) node server.js
//    3) 브라우저에서 http://localhost:3000 접속
//
//  npm install 불필요 (외부 의존성 없음)
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// 정적 파일 MIME 타입 매핑
// ------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// ------------------------------------------------------------
// 한국 시간(KST) 포맷 헬퍼
// "YYYY-MM-DD HH:mm:ss" 형태로 반환
// ------------------------------------------------------------
function formatKST(date) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type).value;
  // hour12:false 에서 자정이 '24'로 나오는 경우 보정
  const hour = get('hour') === '24' ? '00' : get('hour');

  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
}

// ------------------------------------------------------------
// 시간대에 맞는 인사말 선택
// ------------------------------------------------------------
function pickGreeting(date) {
  // KST 기준 시(hour)만 추출
  const hourStr = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hour12: false,
  }).format(date);
  const hour = parseInt(hourStr, 10) % 24;

  if (hour >= 5 && hour < 12) return '좋은 아침입니다!';
  if (hour >= 12 && hour < 18) return '안녕하세요!';
  if (hour >= 18 && hour < 22) return '좋은 저녁입니다!';
  return '늦은 시간까지 수고 많으세요!';
}

// ------------------------------------------------------------
// JSON 응답 헬퍼
// ------------------------------------------------------------
function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

// ------------------------------------------------------------
// 정적 파일 서빙
// ------------------------------------------------------------
function serveStatic(req, res, fileName) {
  const filePath = path.join(__dirname, fileName);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJSON(res, 404, { success: false, message: '파일을 찾을 수 없습니다.' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

// ------------------------------------------------------------
// 서버 생성 & 라우팅
// ------------------------------------------------------------
const server = http.createServer((req, res) => {
  const { method, url } = req;

  try {
    // --- API: 현재 시간 + 인사말 ---
    if (url === '/api/greeting' && method === 'GET') {
      const now = new Date();
      sendJSON(res, 200, {
        success: true,
        data: {
          greeting: pickGreeting(now),
          time: formatKST(now),
        },
      });
      return;
    }

    // --- 정적 파일 라우팅 ---
    if (method === 'GET' && (url === '/' || url === '/index.html')) {
      serveStatic(req, res, 'index.html');
      return;
    }
    if (method === 'GET' && url === '/client.js') {
      serveStatic(req, res, 'client.js');
      return;
    }

    // --- 그 외 ---
    sendJSON(res, 404, { success: false, message: '요청하신 경로를 찾을 수 없습니다.' });
  } catch (err) {
    sendJSON(res, 500, { success: false, message: '서버 내부 오류가 발생했습니다.' });
  }
});

server.listen(PORT, () => {
  console.log('============================================');
  console.log('  서버가 실행되었습니다.');
  console.log(`  접속 주소: http://localhost:${PORT}`);
  console.log('  종료하려면 Ctrl + C 를 누르세요.');
  console.log('============================================');
});
