// PATCH /api/todos/:id  (인증 필요)
// body { done?, text? } → 200 { success, data: {...} }
// 본인 소유가 아니면 404 (존재 여부도 노출하지 않음)
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');

router.patch('/:id', requireAuth, async (req, res, next) => {
  const pool = req.app.locals.pool;
  const id = Number(req.params.id);
  const body = req.body || {};

  if (!Number.isInteger(id)) {
    return res
      .status(404)
      .json({ success: false, message: '할일을 찾을 수 없습니다.' });
  }

  // 동적으로 업데이트할 컬럼 구성 (전달된 필드만)
  const sets = [];
  const values = [];
  let idx = 1;

  if (body.text !== undefined) {
    const text = String(body.text).trim();
    if (!text) {
      return res
        .status(400)
        .json({ success: false, message: '할일 내용을 입력하세요.' });
    }
    sets.push(`text = $${idx++}`);
    values.push(text);
  }
  if (body.done !== undefined) {
    sets.push(`done = $${idx++}`);
    values.push(Boolean(body.done));
  }

  // 수정할 내용이 없으면 400
  if (sets.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: '수정할 내용이 없습니다.' });
  }

  // WHERE 에 user_id 조건을 함께 걸어 본인 것만 수정 → 아니면 0행 → 404
  values.push(id);
  values.push(req.user.id);
  const sql = `update todos set ${sets.join(', ')}
               where id = $${idx++} and user_id = $${idx++}
               returning id, text, done,
                         (extract(epoch from created_at) * 1000)::bigint as "createdAt"`;

  try {
    const result = await pool.query(sql, values);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '할일을 찾을 수 없습니다.' });
    }

    const r = result.rows[0];
    const data = {
      id: Number(r.id),
      text: r.text,
      done: r.done,
      createdAt: Number(r.createdAt),
    };

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
