// GET /api/todos  (인증 필요)
// → { success, data: [{ id, text, done, createdAt }] } — 본인 것만, 최신순
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');

router.get('/', requireAuth, async (req, res, next) => {
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query(
      `select id, text, done,
              (extract(epoch from created_at) * 1000)::bigint as "createdAt"
         from todos
        where user_id = $1
        order by created_at desc`,
      [req.user.id]
    );

    // createdAt 은 bigint → 문자열로 올 수 있어 Number 로 정규화 (epoch ms)
    const data = result.rows.map((r) => ({
      id: Number(r.id),
      text: r.text,
      done: r.done,
      createdAt: Number(r.createdAt),
    }));

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
