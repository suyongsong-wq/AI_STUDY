require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ======== Database (Supabase PostgreSQL) ========
// 연결 문자열은 .env의 DATABASE_URL에서 읽습니다. 비밀번호를 코드에 하드코딩하지 마세요.
// Supabase pooler 연결이므로 SSL 설정이 필요합니다.
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// 서버 시작 시 한 번만 테이블을 생성하도록 flag로 중복 실행 방지
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  // 익명 제출 테이블: 한 사람의 연봉/지출 한 건이 한 행(row)
  //  - 모든 금액은 "만원" 단위 정수 (예: salary 400 = 월 400만원)
  //  - 익명: 이름/이메일 등 개인 식별 정보는 저장하지 않습니다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salary_submissions (
      id               BIGSERIAL PRIMARY KEY,
      job_category     TEXT NOT NULL,
      region           TEXT NOT NULL DEFAULT '기타',   -- 지역 (지역별 통계용)
      years            INTEGER NOT NULL DEFAULT 0,     -- 연차
      salary           INTEGER NOT NULL,               -- 월급 (만원)
      exp_food         INTEGER NOT NULL DEFAULT 0,     -- 식비 (만원)
      exp_housing      INTEGER NOT NULL DEFAULT 0,     -- 주거 (만원)
      exp_transport    INTEGER NOT NULL DEFAULT 0,     -- 교통 (만원)
      exp_subscription INTEGER NOT NULL DEFAULT 0,     -- 구독료 (만원)
      exp_etc          INTEGER NOT NULL DEFAULT 0,     -- 기타 (만원)
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // 기존에 region 컬럼이 없던 DB도 호환되도록 나중에 추가
  await pool.query(`ALTER TABLE salary_submissions ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT '기타';`);
  dbInitialized = true;
}

// ======== Middleware ========
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// /api 라우트 진입 전에 DB 초기화 보장 (테이블이 없으면 만들어 둠)
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err.message);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// 허용 직군 / 지역 (서버에서 화이트리스트 검증 — 잘못된 값 차단)
const JOB_CATEGORIES = ['개발', '디자인', '기획', '마케팅', '영업', '경영지원', '기타'];
const REGIONS = ['서울', '경기·인천', '부산·경남', '대구·경북', '대전·충청', '광주·전라', '강원', '제주', '기타'];

// 월급 분포 6구간 (라벨/순서 고정 — 프론트와 약속). lo<=salary<hi (hi=null이면 이상)
const SALARY_BUCKETS = [
  { label: '200만원 미만', lo: 0,   hi: 200 },
  { label: '200~299만원',  lo: 200, hi: 300 },
  { label: '300~399만원',  lo: 300, hi: 400 },
  { label: '400~499만원',  lo: 400, hi: 500 },
  { label: '500~599만원',  lo: 500, hi: 600 },
  { label: '600만원 이상',  lo: 600, hi: null },
];

// 지출 컬럼 ↔ 응답 키 매핑
const EXPENSE_COLUMNS = {
  food: 'exp_food',
  housing: 'exp_housing',
  transport: 'exp_transport',
  subscription: 'exp_subscription',
  etc: 'exp_etc',
};

// 정수 파싱 + 범위 검증 헬퍼 (실패 시 null)
function parseIntInRange(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

const round = (n) => Math.round(Number(n) || 0);

// ======== 통계 계산 (여러 API에서 재사용) ========
// SQL의 AVG / COUNT / MIN / MAX / PERCENTILE_CONT / GROUP BY 를 적극 활용합니다.
async function computeStats() {
  // 1) 전체 요약 (참여자 수 + 월급 통계 + 카테고리별 평균 지출)
  const summary = await pool.query(`
    SELECT
      COUNT(*)                                            AS count,
      COALESCE(ROUND(AVG(salary)), 0)                     AS salary_avg,
      COALESCE(MIN(salary), 0)                            AS salary_min,
      COALESCE(MAX(salary), 0)                            AS salary_max,
      COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary)), 0) AS salary_median,
      COALESCE(ROUND(AVG(exp_food)), 0)                   AS exp_food,
      COALESCE(ROUND(AVG(exp_housing)), 0)                AS exp_housing,
      COALESCE(ROUND(AVG(exp_transport)), 0)              AS exp_transport,
      COALESCE(ROUND(AVG(exp_subscription)), 0)           AS exp_subscription,
      COALESCE(ROUND(AVG(exp_etc)), 0)                    AS exp_etc
    FROM salary_submissions
  `);
  const s = summary.rows[0];
  const count = Number(s.count);

  // 데이터가 없으면 0으로 안전하게 반환 (0으로 나누기 방지)
  const emptyDistribution = SALARY_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  if (count === 0) {
    return {
      count: 0,
      salary: { avg: 0, min: 0, max: 0, median: 0, distribution: emptyDistribution },
      expenses: { food: 0, housing: 0, transport: 0, subscription: 0, etc: 0, total: 0 },
      byJobCategory: [],
      byRegion: [],
    };
  }

  // 2) 월급 분포 — CASE로 6구간 버킷팅 후 GROUP BY
  const dist = await pool.query(`
    SELECT
      CASE
        WHEN salary < 200 THEN '200만원 미만'
        WHEN salary < 300 THEN '200~299만원'
        WHEN salary < 400 THEN '300~399만원'
        WHEN salary < 500 THEN '400~499만원'
        WHEN salary < 600 THEN '500~599만원'
        ELSE '600만원 이상'
      END AS label,
      COUNT(*) AS count
    FROM salary_submissions
    GROUP BY label
  `);
  const distMap = Object.fromEntries(dist.rows.map((r) => [r.label, Number(r.count)]));
  const distribution = SALARY_BUCKETS.map((b) => ({ label: b.label, count: distMap[b.label] || 0 }));

  // 3) 직군별 비교 — GROUP BY job_category, 평균 월급 내림차순
  const byJob = await pool.query(`
    SELECT
      job_category                                                 AS job_category,
      COUNT(*)                                                     AS count,
      ROUND(AVG(salary))                                           AS avg_salary,
      ROUND(AVG(exp_food + exp_housing + exp_transport + exp_subscription + exp_etc)) AS avg_expense_total
    FROM salary_submissions
    GROUP BY job_category
    ORDER BY avg_salary DESC
  `);

  // 4) 지역별 비교 (창의성: 지역별 통계) — GROUP BY region, 평균 월급 내림차순
  const byRegion = await pool.query(`
    SELECT
      region                                                       AS region,
      COUNT(*)                                                     AS count,
      ROUND(AVG(salary))                                           AS avg_salary,
      ROUND(AVG(exp_food + exp_housing + exp_transport + exp_subscription + exp_etc)) AS avg_expense_total
    FROM salary_submissions
    GROUP BY region
    ORDER BY avg_salary DESC
  `);

  const expenses = {
    food: round(s.exp_food),
    housing: round(s.exp_housing),
    transport: round(s.exp_transport),
    subscription: round(s.exp_subscription),
    etc: round(s.exp_etc),
  };
  expenses.total = expenses.food + expenses.housing + expenses.transport + expenses.subscription + expenses.etc;

  return {
    count,
    salary: {
      avg: round(s.salary_avg),
      min: Number(s.salary_min),
      max: Number(s.salary_max),
      median: round(s.salary_median),
      distribution,
    },
    expenses,
    byJobCategory: byJob.rows.map((r) => ({
      jobCategory: r.job_category,
      count: Number(r.count),
      avgSalary: round(r.avg_salary),
      avgExpenseTotal: round(r.avg_expense_total),
    })),
    byRegion: byRegion.rows.map((r) => ({
      region: r.region,
      count: Number(r.count),
      avgSalary: round(r.avg_salary),
      avgExpenseTotal: round(r.avg_expense_total),
    })),
  };
}

// ======== API ========

// 1) 전체 통계 (평균/분포/직군별/지역별)
app.get('/api/stats', async (_req, res) => {
  try {
    const data = await computeStats();
    res.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/stats error:', err.message);
    res.status(500).json({ success: false, message: '통계를 불러오지 못했습니다.' });
  }
});

// 2) 익명 제출 + "내 위치" 즉시 계산
app.post('/api/submissions', async (req, res) => {
  try {
    // ----- 입력 검증 (화이트리스트 + 범위) -----
    const jobCategory = (req.body.jobCategory ?? '').toString().trim();
    if (!JOB_CATEGORIES.includes(jobCategory)) {
      return res.status(400).json({ success: false, message: '직군을 올바르게 선택하세요.' });
    }

    // region은 선택값 — 비어 있으면 '기타'로 처리, 값이 있으면 화이트리스트 검증
    let region = (req.body.region ?? '').toString().trim();
    if (!region) region = '기타';
    if (!REGIONS.includes(region)) {
      return res.status(400).json({ success: false, message: '지역을 올바르게 선택하세요.' });
    }

    const years = parseIntInRange(req.body.years, 0, 50);
    if (years === null) {
      return res.status(400).json({ success: false, message: '연차는 0~50 사이의 숫자여야 합니다.' });
    }

    const salary = parseIntInRange(req.body.salary, 1, 100000);
    if (salary === null) {
      return res.status(400).json({ success: false, message: '월급(만원)은 1~100000 사이의 숫자여야 합니다.' });
    }

    // 지출 5종 — 없으면 0, 있으면 0~100000 정수
    const expensesInput = req.body.expenses || {};
    const exp = {};
    for (const key of Object.keys(EXPENSE_COLUMNS)) {
      const raw = expensesInput[key];
      const value = raw === undefined || raw === null || raw === '' ? 0 : parseIntInRange(raw, 0, 100000);
      if (value === null) {
        return res.status(400).json({ success: false, message: `지출(${key})은 0~100000 사이의 숫자여야 합니다.` });
      }
      exp[key] = value;
    }
    const totalExpense = Object.values(exp).reduce((a, b) => a + b, 0);

    // ----- INSERT -----
    const { rows } = await pool.query(
      `INSERT INTO salary_submissions
        (job_category, region, years, salary, exp_food, exp_housing, exp_transport, exp_subscription, exp_etc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [jobCategory, region, years, salary, exp.food, exp.housing, exp.transport, exp.subscription, exp.etc]
    );
    const id = Number(rows[0].id);

    // ----- 내 위치 계산 (제출 직후) -----
    // salaryTopPercent: 나보다 월급이 '많은' 사람 비율(%). 작을수록 고소득.
    // expenseTopPercent: 나보다 총지출이 '많은' 사람 비율(%).
    const pos = await pool.query(
      `SELECT
         COUNT(*)                                                                          AS total,
         COUNT(*) FILTER (WHERE salary > $1)                                               AS salary_higher,
         COUNT(*) FILTER (WHERE (exp_food+exp_housing+exp_transport+exp_subscription+exp_etc) > $2) AS expense_higher,
         COALESCE(ROUND(AVG(salary)), 0)                                                   AS salary_avg
       FROM salary_submissions`,
      [salary, totalExpense]
    );
    const p = pos.rows[0];
    const total = Number(p.total);
    // 비율 반올림, 0이면 1로 (내가 1등이면 "상위 1%")
    const topPercent = (higher) => {
      if (total <= 0) return 100;
      const pct = Math.round((Number(higher) / total) * 100);
      return pct <= 0 ? 1 : pct;
    };

    const stats = await computeStats();

    res.status(201).json({
      success: true,
      data: {
        id,
        myPosition: {
          salaryTopPercent: topPercent(p.salary_higher),
          expenseTopPercent: topPercent(p.expense_higher),
          salaryVsAvg: salary - round(p.salary_avg),
          totalExpense,
        },
        stats,
      },
    });
  } catch (err) {
    console.error('POST /api/submissions error:', err.message);
    res.status(500).json({ success: false, message: '제출을 저장하지 못했습니다.' });
  }
});

// ======== Startup ========
// 로컬에서는 직접 실행, Vercel에서는 module.exports로 동작
if (require.main === module) {
  app.listen(PORT, async () => {
    try {
      await initDB();
      console.log(`Server running on http://localhost:${PORT}`);
    } catch (err) {
      console.error('DB 연결/초기화 실패:', err.message);
      console.error('.env의 DATABASE_URL과 비밀번호를 확인하세요.');
    }
  });
}

module.exports = app;
