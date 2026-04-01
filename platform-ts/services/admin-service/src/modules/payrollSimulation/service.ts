import type { FastifyInstance } from 'fastify';

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
      data: { tenant_id: tenantId, service: 'admin-service', type: 'payroll.simulated', payload: { year, month, count: results.length } }
    } as any)
    .catch(() => {});

  return { ok: true as const, data: results, meta: { year, month } };
};
