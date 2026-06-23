// 인증/인가 미들웨어
const { verifyToken } = require('../utils/jwt');

// requireAuth: Authorization: Bearer <token> 헤더를 검증하고
// 성공 시 req.user = { id, email, role } 를 채웁니다.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res
      .status(401)
      .json({ success: false, message: '인증 토큰이 필요합니다.' });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    // 만료/위조 등 모든 검증 실패는 동일하게 401 (상세 사유 노출 안 함)
    return res
      .status(401)
      .json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }
}

// requireAdmin: requireAuth 이후에 사용. role !== 'admin' 이면 403.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res
      .status(403)
      .json({ success: false, message: '관리자만 접근할 수 있습니다.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
