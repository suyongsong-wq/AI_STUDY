// GET /api/auth/me  (인증 필요)
// → { success, data: { user: { id, email, role } } }
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');

router.get('/me', requireAuth, (req, res) => {
  // requireAuth 가 토큰을 검증해 req.user 를 채워줍니다.
  const { id, email, role } = req.user;
  return res.json({ success: true, data: { user: { id, email, role } } });
});

module.exports = router;
