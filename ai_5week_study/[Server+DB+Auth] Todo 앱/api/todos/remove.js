// DELETE /api/todos/:id  (인증 필요)
// → 200 { success, data: { id } } / 본인 것 아니면 404
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');

router.delete('/:id', requireAuth, async (req, res, next) => {
  const pool = req.app.locals.pool;
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res
      .status(404)
      .json({ success: false, message: '할일을 찾을 수 없습니다.' });
  }

  try {
    // user_id 조건을 함께 걸어 본인 것만 삭제 → 0행이면 404
    const result = await pool.query(
      'delete from todos where id = $1 and user_id = $2 returning id',
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '할일을 찾을 수 없습니다.' });
    }

    return res.json({ success: true, data: { id: Number(result.rows[0].id) } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
