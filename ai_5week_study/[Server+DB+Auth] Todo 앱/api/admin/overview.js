// GET /api/admin/overview  (requireAuth + requireAdmin)
// → { success, data: { userCount, todoCount, doneCount, users: [...] } }
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');

router.get('/overview', requireAuth, requireAdmin, async (req, res, next) => {
  const pool = req.app.locals.pool;
  try {
    // 전체 집계 (한 방에)
    const totals = await pool.query(
      `select
         (select count(*) from users)                          as "userCount",
         (select count(*) from todos)                          as "todoCount",
         (select count(*) from todos where done = true)        as "doneCount"`
    );

    // 유저별 집계: todos 를 LEFT JOIN 하여 할일/완료 수 계산, 가입 순 정렬
    const usersResult = await pool.query(
      `select
         u.id,
         u.email,
         u.role,
         (extract(epoch from u.created_at) * 1000)::bigint              as "createdAt",
         count(t.id)                                                    as "todoCount",
         count(t.id) filter (where t.done = true)                       as "doneCount"
       from users u
       left join todos t on t.user_id = u.id
       group by u.id, u.email, u.role, u.created_at
       order by u.created_at asc`
    );

    const t = totals.rows[0];
    const users = usersResult.rows.map((r) => ({
      id: Number(r.id),
      email: r.email,
      role: r.role,
      createdAt: Number(r.createdAt),
      todoCount: Number(r.todoCount),
      doneCount: Number(r.doneCount),
    }));

    return res.json({
      success: true,
      data: {
        userCount: Number(t.userCount),
        todoCount: Number(t.todoCount),
        doneCount: Number(t.doneCount),
        users,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
