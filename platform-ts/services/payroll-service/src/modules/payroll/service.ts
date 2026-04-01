import type { FastifyInstance } from 'fastify';
import { Queues, queue } from '../../utils/queues';
import { cacheGetJson, cacheSetJson } from '../../utils/cache';
import { getPayslip } from './repository';

export const calculateIncentive = (revenue: number) => {
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

const incentiveKey = (tenantId: string, jobId: string) => `incentive:${tenantId}:${jobId}`;

export const enqueueIncentiveCalc = async (app: FastifyInstance, tenantId: string, revenue: number) => {
  const r = Number(revenue || 0);
  if (!tenantId || !Number.isFinite(r) || r < 0) return { ok: false as const, error: 'invalid revenue' };
  const q = queue(app.redis, Queues.PAYROLL_INCENTIVE_CALC);
  const job = await q.add(
    'incentive-calc',
    { tenant_id: tenantId, revenue: r },
    { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: true }
  );
  return { ok: true as const, data: { job_id: String(job.id) } };
};

export const getIncentiveResult = async (app: FastifyInstance, tenantId: string, jobId: string) => {
  const id = String(jobId || '').trim();
  if (!tenantId || !id) return { ok: false as const, error: 'invalid request' };
  const raw = await app.redis.get(incentiveKey(tenantId, id));
  if (!raw) return { ok: false as const, error: 'not_ready' };
  return { ok: true as const, data: JSON.parse(raw), cached: true };
};

export const enqueueRecalc = async (app: FastifyInstance, tenantId: string, body: { employee_id: string; month: number; year: number }) => {
  const employee_id = String(body.employee_id || '').trim();
  const month = Number(body.month || 0);
  const year = Number(body.year || 0);
  if (!tenantId || !employee_id || month < 1 || month > 12 || year < 2000) return { ok: false as const, error: 'invalid payload' };
  const q = queue(app.redis, Queues.PAYROLL_RECALC_EMP_MONTH);
  await q.add(
    'recalc-employee-month',
    { tenant_id: tenantId, employee_id, month, year },
    { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true }
  );
  return { ok: true as const, queued: true };
};

const payslipKey = (tenantId: string, employeeId: string, year: number, month: number) => `payslip:${tenantId}:${employeeId}:${year}:${month}`;

export const fetchPayslip = async (app: FastifyInstance, args: { tenantId: string; employeeId: string; year?: string; month?: string }) => {
  const tenantId = String(args.tenantId || '').trim();
  const employeeId = String(args.employeeId || '').trim();
  const now = new Date();
  const year = args.year ? Number(args.year) : now.getUTCFullYear();
  const month = args.month ? Number(args.month) : now.getUTCMonth() + 1;
  if (!tenantId || !employeeId || !Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false as const, error: 'invalid request' };
  }

  const key = payslipKey(tenantId, employeeId, year, month);
  const cached = await cacheGetJson<any>(app.redis, key);
  if (cached) return { ok: true as const, data: cached, cached: true };

  const row = await getPayslip(app.prismaRead, { tenantId, employeeId, year, month });
  if (!row) return { ok: false as const, error: 'not found' };
  await cacheSetJson(app.redis, key, row, 300);
  return { ok: true as const, data: row, cached: false };
};

export const simulatePayroll = async (
  app: FastifyInstance,
  tenantId: string,
  body: { employee_id?: string; employee_ids?: string[]; year: number; month: number }
) => {
  const month = Number(body.month || 0);
  const year = Number(body.year || 0);
  if (month < 1 || month > 12 || year < 2000) return { ok: false as const, error: 'invalid month/year' };

  const ids = [
    ...(body.employee_id ? [String(body.employee_id)] : []),
    ...(Array.isArray(body.employee_ids) ? body.employee_ids.map((x) => String(x)) : [])
  ]
    .map((x) => x.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(ids)).slice(0, 200);
  if (!unique.length) return { ok: false as const, error: 'employee_id(s) required' };

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));

  const salaryRows = await app.prismaRead.salary_profiles.findMany({
    where: { tenant_id: tenantId, employee_id: { in: unique } } as any,
    orderBy: [{ employee_id: 'asc' }, { effective_from: 'desc' }],
    distinct: ['employee_id'],
    select: { employee_id: true, salary: true }
  });
  const salaryByEmp = new Map<string, number>(salaryRows.map((r: any) => [String(r.employee_id), Number(r.salary || 0)]));

  const days = await app.prismaRead.attendance_days.findMany({
    where: { tenant_id: tenantId, employee_id: { in: unique }, date: { gte: monthStart, lt: nextMonth } } as any,
    select: { employee_id: true, status: true }
  });
  const attByEmp = new Map<string, { total_days: number; half_days: number; lop_days: number; absent_days: number }>();
  for (const d of days as any[]) {
    const id = String(d.employee_id);
    const status = String(d.status || '');
    const curr = attByEmp.get(id) || { total_days: 0, half_days: 0, lop_days: 0, absent_days: 0 };
    curr.total_days += 1;
    if (status === 'lop') curr.lop_days += 1;
    else if (status === 'absent') curr.absent_days += 1;
    else if (status === 'half_day' || status === 'half day') curr.half_days += 1;
    attByEmp.set(id, curr);
  }

  const results = unique.map((employee_id) => {
    const baseSalary = Number(salaryByEmp.get(employee_id) || 0);
    const att = attByEmp.get(employee_id) || { total_days: 0, half_days: 0, lop_days: 0, absent_days: 0 };
    const workingDays = Math.max(1, att.total_days || 26);
    const perDay = baseSalary / workingDays;
    const deductions = perDay * att.lop_days + perDay * att.absent_days + perDay * 0.5 * att.half_days;
    const gross = baseSalary;
    const net = gross - deductions;
    return {
      employee_id,
      year,
      month,
      gross,
      deductions,
      net,
      meta: { half_days: att.half_days, lop_days: att.lop_days, absent_days: att.absent_days, working_days: workingDays }
    };
  });

  await app.prisma.event_logs
    .create({
      data: { tenant_id: tenantId, service: 'payroll-service', type: 'payroll.simulated', payload: { year, month, count: results.length } }
    } as any)
    .catch(() => {});

  return { ok: true as const, data: results, meta: { year, month } };
};
