// POST /api/auth/login
// body { email, password } → 200 { success, data: { token, user } }
const express = require('express');
const router = express.Router();
const { comparePassword } = require('../../utils/password');
const { signToken } = require('../../utils/jwt');

router.post('/login', async (req, res, next) => {
  const pool = req.app.locals.pool;
  const { email, password } = req.body || {};

  // 입력 누락도 동일한 일반 메시지로 처리 (어느 쪽이 틀렸는지 노출하지 않음)
  if (!email || !password) {
    return res.status(401).json({
      success: false,
      message: '이메일 또는 비밀번호가 올바르지 않습니다.',
    });
  }

  try {
    const result = await pool.query(
      'select id, email, role, password_hash from users where email = $1',
      [email]
    );

    // 유저 없음 → 일반 401 (이메일 존재 여부 노출 금지)
    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    const row = result.rows[0];
    const ok = await comparePassword(password, row.password_hash);

    // 비밀번호 불일치 → 동일한 일반 401
    if (!ok) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    const user = { id: row.id, email: row.email, role: row.role }; // hash 제외
    const token = signToken(user);

    return res.status(200).json({ success: true, data: { token, user } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
