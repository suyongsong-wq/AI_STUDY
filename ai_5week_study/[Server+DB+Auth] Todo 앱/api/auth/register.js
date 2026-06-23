// POST /api/auth/register
// body { email, password } → 201 { success, data: { token, user } }
const express = require('express');
const router = express.Router();
const { hashPassword } = require('../../utils/password');
const { signToken } = require('../../utils/jwt');

// 아주 단순한 이메일 형식 검사
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res, next) => {
  const pool = req.app.locals.pool;
  const { email, password } = req.body || {};

  // 입력 검증
  if (!email || !EMAIL_RE.test(email)) {
    return res
      .status(400)
      .json({ success: false, message: '올바른 이메일 형식이 아닙니다.' });
  }
  if (!password || password.length < 6) {
    return res
      .status(400)
      .json({ success: false, message: '비밀번호는 6자 이상이어야 합니다.' });
  }

  try {
    // 중복 이메일 사전 확인 → 409
    const dup = await pool.query('select id from users where email = $1', [email]);
    if (dup.rowCount > 0) {
      return res
        .status(409)
        .json({ success: false, message: '이미 가입된 이메일입니다.' });
    }

    // 비밀번호는 bcrypt 해시로만 저장
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `insert into users (email, password_hash)
       values ($1, $2)
       returning id, email, role`,
      [email, passwordHash]
    );

    const user = result.rows[0]; // { id, email, role } — password_hash 미포함
    const token = signToken(user);

    return res.status(201).json({ success: true, data: { token, user } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
