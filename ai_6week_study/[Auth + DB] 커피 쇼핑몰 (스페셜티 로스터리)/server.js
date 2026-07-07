// ============================================================
// ☕ Ember Roasters — 로컬 개발 서버
//   · 정적 파일(index.html) 서빙
//   · GET  /api/imagekit/config → publicKey, urlEndpoint (공개값)
//   · POST /api/imagekit/auth   → { token, expire, signature }  (Private Key는 서버에만)
// 의존성 0개 — Node 18+ 내장 http/crypto/fs 만 사용.
//   실행:  node server.js   (환경변수는 .env 또는 셸에서 주입)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- .env 간단 로더 (dotenv 없이) ---
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split('\n').forEach((line) => {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!m) return;
      const key = m[1];
      let val = (m[2] || '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    });
  } catch (_) { /* .env 없으면 셸 환경변수 사용 */ }
})();

const PORT = process.env.PORT || 8777;
const IK_PUBLIC = process.env.IMAGEKIT_PUBLIC_KEY || '';
const IK_PRIVATE = process.env.IMAGEKIT_PRIVATE_KEY || '';
const IK_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT || '';
const TOSS_CLIENT = process.env.TOSS_CLIENT_KEY || '';
const TOSS_SECRET = process.env.TOSS_SECRET_KEY || '';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ImageKit 클라이언트 업로드용 인증 파라미터 생성 (HMAC-SHA1)
function makeImageKitAuth() {
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 60 * 30; // 30분 (1시간 이내여야 함)
  const signature = crypto.createHmac('sha1', IK_PRIVATE).update(token + expire).digest('hex');
  return { token, expire, signature };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // --- API: ImageKit 공개 설정 ---
  if (pathname === '/api/imagekit/config' && req.method === 'GET') {
    if (!IK_PUBLIC || !IK_ENDPOINT) {
      return sendJson(res, 500, { error: 'ImageKit 환경변수가 설정되지 않았어요. .env를 확인해 주세요.' });
    }
    return sendJson(res, 200, { publicKey: IK_PUBLIC, urlEndpoint: IK_ENDPOINT });
  }

  // --- API: ImageKit 업로드 서명 (Private Key는 여기서만 사용) ---
  if (pathname === '/api/imagekit/auth' && req.method === 'POST') {
    if (!IK_PRIVATE) {
      return sendJson(res, 500, { error: 'IMAGEKIT_PRIVATE_KEY가 없어요. .env를 확인해 주세요.' });
    }
    return sendJson(res, 200, makeImageKitAuth());
  }

  // --- API: 토스 클라이언트 키 (공개값) ---
  if (pathname === '/api/toss/config' && req.method === 'GET') {
    if (!TOSS_CLIENT) return sendJson(res, 500, { error: '토스 클라이언트 키가 설정되지 않았어요. .env를 확인해 주세요.' });
    return sendJson(res, 200, { clientKey: TOSS_CLIENT });
  }

  // --- API: 토스 결제 승인 (Secret Key는 여기서만 · 반드시 서버에서 호출) ---
  if (pathname === '/api/payments/confirm' && req.method === 'POST') {
    if (!TOSS_SECRET) return sendJson(res, 500, { error: 'TOSS_SECRET_KEY가 없어요. .env를 확인해 주세요.' });
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const { paymentKey, orderId, amount } = JSON.parse(body || '{}');
        if (!paymentKey || !orderId || amount == null) {
          return sendJson(res, 400, { error: '필수 파라미터(paymentKey/orderId/amount)가 없어요.' });
        }
        const basic = Buffer.from(TOSS_SECRET + ':').toString('base64');
        const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + basic, 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
        });
        const data = await r.json();
        return sendJson(res, r.status, data);   // 성공(200) / 실패 모두 그대로 전달
      } catch (e) {
        return sendJson(res, 500, { error: '결제 승인 처리 중 오류: ' + e.message });
      }
    });
    return;
  }

  // --- 정적 파일 서빙 ---
  let filePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  filePath = path.join(__dirname, path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`☕ Ember Roasters 서버 → http://localhost:${PORT}`);
  console.log(`   ImageKit: ${IK_PUBLIC ? '설정됨 ✓' : '미설정 (.env 필요) ✗'}`);
  console.log(`   Toss:     ${TOSS_CLIENT ? '설정됨 ✓' : '미설정 (.env 필요) ✗'}`);
});
