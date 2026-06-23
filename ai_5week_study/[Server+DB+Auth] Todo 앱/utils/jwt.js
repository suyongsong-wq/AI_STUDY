// JWT 발급/검증 유틸
// 시크릿은 절대 하드코딩하지 않고 process.env.JWT_SECRET 에서만 읽습니다.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = '7d'; // 토큰 만료 7일

// 시크릿이 없으면 서버를 띄우면 안 됩니다 → 시작 즉시 실패시킵니다.
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되어 있지 않습니다. .env 를 확인하세요.');
}

// payload(id,email,role) → 토큰 문자열
function signToken(payload) {
  return jwt.sign(
    { id: payload.id, email: payload.email, role: payload.role },
    JWT_SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// 토큰 검증 → payload 반환 (실패 시 throw)
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };
