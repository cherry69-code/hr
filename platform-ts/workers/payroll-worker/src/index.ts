import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const url = String(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const connection = new Redis(url, { maxRetriesPerRequest: null });

const QUEUE_RECALC = 'payroll.recalculateEmployeeMonth';
const QUEUE_BATCH = 'payroll.batch';
const QUEUE_INCENTIVE = 'payroll.incentive.calculate';
const QUEUE_PRECOMPUTE = 'payroll.precomputeMonth';
const DLQ = `${QUEUE_RECALC}.dlq`;
const DLQ_BATCH = `${QUEUE_BATCH}.dlq`;
const DLQ_INCENTIVE = `${QUEUE_INCENTIVE}.dlq`;
const DLQ_PRECOMPUTE = `${QUEUE_PRECOMPUTE}.dlq`;

const pendingKey = (tenantId: string, year: number, month: number) => `payroll:pending:${tenantId}:${year}:${month}`;
const batchLockKey = (tenantId: string, year: number, month: number) => `lock:payroll:batch:${tenantId}:${year}:${month}`;

const addPending = async (tenantId: string, employeeId: string, year: number, month: number) => {
  const key = pendingKey(tenantId, year, month);
  await connection.sadd(key, employeeId);
  await connection.expire(key, 24 * 60 * 60);
};

const runBatch = async (tenantId: string, year: number, month: number) => {
  const lockKey = batchLockKey(tenantId, year, month);
  const acquired = await connection.set(lockKey, '1', 'NX', 'PX', 4 * 60 * 1000);
  if (!acquired) return;

  const key = pendingKey(tenantId, year, month);
  const ids = await connection.smembers(key);
  if (!ids.length) {
    await connection.del(lockKey);
    return;
  }
  const batch = ids.slice(0, 1000);

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));

  for (const employeeId of batch) {
    const salary = await prisma.salary_profiles.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId } as any,
      orderBy: { effective_from: 'desc' },
      select: { salary: true }
    });
    const baseSalary = Number(salary?.salary || 0);
    const days = await prisma.attendance_days.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId, date: { gte: monthStart, lt: nextMonth } } as any,
      select: { status: true }
    });
    const halfDays = days.filter((d) => String(d.status) === 'half_day' || String(d.status) === 'half day').length;
    const lopDays = days.filter((d) => String(d.status) === 'lop').length;
    const absentDays = days.filter((d) => String(d.status) === 'absent').length;

    const workingDays = Math.max(1, days.length || 26);
    const perDay = baseSalary / workingDays;
    const deductions = perDay * lopDays + perDay * absentDays + perDay * 0.5 * halfDays;
    const gross = baseSalary;
    const net = gross - deductions;

    const payslip = await prisma.payslips.upsert({
      where: { tenant_id_employee_id_year_month: { tenant_id: tenantId, employee_id: employeeId, year, month } } as any,
      create: {
        tenant_id: tenantId,
        employee_id: employeeId,
        year,
        month,
        gross,
        deductions,
        net,
        meta: { half_days: halfDays, lop_days: lopDays, absent_days: absentDays }
      },
      update: {
        tenant_id: tenantId,
        gross,
        deductions,
        net,
        meta: { half_days: halfDays, lop_days: lopDays, absent_days: absentDays },
        updated_at: new Date()
      }
    });

    await connection
      .publish(
        'cache.invalidate',
        JSON.stringify({
          keys: [`payslip:${tenantId}:${employeeId}:${year}:${month}`],
          tags: [`http:payroll:${tenantId}`, `http:admin:${tenantId}`]
        })
      )
      .catch(() => {});

    await prisma.event_logs
      .create({
        data: {
          tenant_id: tenantId,
          service: 'payroll-worker',
          type: 'payroll.payslip.upserted',
          payload: { employee_id: employeeId, year, month, payslip_id: payslip.id }
        }
      } as any)
      .catch(() => {});
  }

  await connection.del(key);
  await connection.del(lockKey);
};

const dlq = new Queue(DLQ, { connection });
const dlqBatch = new Queue(DLQ_BATCH, { connection });
const dlqIncentive = new Queue(DLQ_INCENTIVE, { connection });
const dlqPrecompute = new Queue(DLQ_PRECOMPUTE, { connection });

const recalcWorker = new Worker(
  QUEUE_RECALC,
  async (job) => {
    const tenant_id = String(job.data?.tenant_id || '').trim();
    const employee_id = String(job.data?.employee_id || '').trim();
    const month = Number(job.data?.month || 0);
    const year = Number(job.data?.year || 0);
    if (!tenant_id || !employee_id || month < 1 || month > 12 || year < 2000) return;
    await addPending(tenant_id, employee_id, year, month);

    await prisma.event_logs
      .create({
        data: {
          tenant_id,
          service: 'payroll-worker',
          type: 'payroll.recalc.queued',
          payload: { employee_id, year, month }
        }
      } as any)
      .catch(() => {});
  },
  { connection, concurrency: 50 }
);

recalcWorker.on('failed', async (job, err) => {
  const attempts = job?.opts?.attempts || 1;
  const attemptsMade = (job as any)?.attemptsMade ?? 0;
  if (attemptsMade >= attempts - 1) {
    await dlq.add(
      'dlq',
      { queue: QUEUE_RECALC, jobId: job?.id, data: job?.data, error: String(err?.message || err) },
      { removeOnComplete: true }
    );
  }
});

const batchQueue = new Queue(QUEUE_BATCH, { connection });
batchQueue
  .add(
    'batch',
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'payroll-batch', removeOnComplete: true, removeOnFail: true }
  )
  .catch(() => {});

const batchWorker = new Worker(
  QUEUE_BATCH,
  async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const tenants = await prisma.tenants.findMany({ select: { id: true } }).catch(() => []);
    if (!tenants.length) {
      await runBatch('00000000-0000-0000-0000-000000000001', year, month).catch(() => {});
      return;
    }
    for (const t of tenants) {
      await runBatch(String((t as any).id), year, month).catch(() => {});
    }
  },
  { connection, concurrency: 1 }
);

batchWorker.on('failed', async (job, err) => {
  const attempts = job?.opts?.attempts || 1;
  const attemptsMade = (job as any)?.attemptsMade ?? 0;
  if (attemptsMade >= attempts - 1) {
    await dlqBatch.add(
      'dlq',
      { queue: QUEUE_BATCH, jobId: job?.id, data: job?.data, error: String(err?.message || err) },
      { removeOnComplete: true }
    );
  }
});

const precomputeQueue = new Queue(QUEUE_PRECOMPUTE, { connection });
precomputeQueue
  .add(
    'precompute',
    {},
    { repeat: { pattern: '0 1 * * *' }, jobId: 'payroll-precompute', removeOnComplete: true, removeOnFail: true }
  )
  .catch(() => {});

const precomputeWorker = new Worker(
  QUEUE_PRECOMPUTE,
  async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const tenants = await prisma.tenants.findMany({ select: { id: true } }).catch(() => []);
    const tenantIds = tenants.length ? tenants.map((t) => String((t as any).id)) : ['00000000-0000-0000-0000-000000000001'];
    for (const tenantId of tenantIds) {
      const employees = await prisma.employees
        .findMany({ where: { tenant_id: tenantId, status: 'active' } as any, select: { id: true } })
        .catch(() => []);
      const ids = employees.map((e) => String((e as any).id)).filter(Boolean);
      if (ids.length) {
        const key = pendingKey(tenantId, year, month);
        await connection.sadd(key, ...ids).catch(() => {});
        await connection.expire(key, 24 * 60 * 60).catch(() => {});
      }
      await runBatch(tenantId, year, month).catch(() => {});
    }
  },
  { connection, concurrency: 1 }
);

precomputeWorker.on('failed', async (job, err) => {
  const attempts = job?.opts?.attempts || 1;
  const attemptsMade = (job as any)?.attemptsMade ?? 0;
  if (attemptsMade >= attempts - 1) {
    await dlqPrecompute.add('dlq', { queue: QUEUE_PRECOMPUTE, jobId: job?.id, data: job?.data, error: String(err?.message || err) }, { removeOnComplete: true });
  }
});

const calcIncentive = (revenue: number) => {
  const r = Number(revenue);
  const slabs = [
    { upto: 200000, rate: 0.05 },
    { upto: Infinity, rate: 0.15 }
  ];
  let remaining = Math.max(0, r);
  let total = 0;
  const breakdown: Array<{ slab: string; amount: number; rate: number; incentive: number }> = [];

  let prevCap = 0;
  for (const s of slabs) {
    if (remaining <= 0) break;
    const cap = s.upto;
    const slabSize = cap === Infinity ? remaining : Math.max(0, Math.min(remaining, cap - prevCap));
    const incentive = slabSize * s.rate;
    total += incentive;
    breakdown.push({
      slab: cap === Infinity ? `>${prevCap}` : `${prevCap + 1}-${cap}`,
      amount: slabSize,
      rate: s.rate,
      incentive
    });
    remaining -= slabSize;
    prevCap = cap === Infinity ? prevCap : cap;
  }

  return { incentive_amount: total, breakdown };
};

const incentiveWorker = new Worker(
  QUEUE_INCENTIVE,
  async (job) => {
    const tenant_id = String(job.data?.tenant_id || '').trim();
    const revenue = Number(job.data?.revenue || 0);
    if (!tenant_id || !Number.isFinite(revenue) || revenue < 0) return;
    const result = calcIncentive(revenue);
    await connection.set(`incentive:${tenant_id}:${job.id}`, JSON.stringify(result), 'EX', 300);
    await prisma.event_logs
      .create({ data: { tenant_id, service: 'payroll-worker', type: 'payroll.incentive.calculated', payload: { revenue } } } as any)
      .catch(() => {});
  },
  { connection, concurrency: 20 }
);

incentiveWorker.on('failed', async (job, err) => {
  const attempts = job?.opts?.attempts || 1;
  const attemptsMade = (job as any)?.attemptsMade ?? 0;
  if (attemptsMade >= attempts - 1) {
    await dlqIncentive.add('dlq', { queue: QUEUE_INCENTIVE, jobId: job?.id, data: job?.data, error: String(err?.message || err) }, { removeOnComplete: true });
  }
});

process.on('SIGINT', () => process.exit(0));
