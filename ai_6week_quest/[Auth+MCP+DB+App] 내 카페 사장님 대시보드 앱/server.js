// 로컬 개발 서버: index.html 정적 서빙 + POST /api/brief 처리(Vercel 서버리스와 동일 로직).
// 실행: node server.js  →  http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateBriefing } from './lib/generateBriefing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// .env 간단 로더(dotenv 없이)
async function loadEnv() {
  try {
    const raw = await readFile(path.join(__dirname, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* .env 없으면 무시 */ }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  // API: 브리핑
  if (req.method === 'POST' && req.url === '/api/brief') {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      const briefing = await generateBriefing(data, process.env.GEMINI_API_KEY);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ briefing }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message || 'AI 브리핑 생성 실패' }));
    }
    return;
  }

  // 정적: index.html
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const html = await readFile(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404); res.end('index.html not found');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

await loadEnv();
server.listen(PORT, () => console.log(`☕ 대시보드 로컬 서버: http://localhost:${PORT}`));
