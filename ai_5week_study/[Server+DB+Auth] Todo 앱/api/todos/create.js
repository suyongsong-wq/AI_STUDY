// POST /api/todos  (인증 필요)
// body { text } → 201 { success, data: { id, text, done, createdAt } }
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');

router.post('/', requireAuth, async (req, res, next) => {
  const pool = req.app.locals.pool;
  const text = (req.body && req.body.text != null ? String(req.body.text) : '').trim();

  // 빈 text → 400
  if (!text) {
    return res
      .status(400)
      .json({ success: false, message: '할일 내용을 입력하세요.' });
  }

  try {
    const result = await pool.query(
      `insert into todos (user_id, text)
       values ($1, $2)
       returning id, text, done,
                 (extract(epoch from created_at) * 1000)::bigint as "createdAt"`,
      [req.user.id, text]
    );

    const r = result.rows[0];
    const data = {
      id: Number(r.id),
      text: r.text,
      done: r.done,
      createdAt: Number(r.createdAt),
    };

    return res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
