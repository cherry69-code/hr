import { Prisma, PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Queues } from '../utils/queues';

const prisma = new PrismaClient();

const compute = (date: string, punches: Date[]) => {
  const sorted = (punches || []).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime());
  if (!sorted.length) {
    return { check_in: null, check_out: null, working_minutes: 0, late_flag: false, late_minutes: 0, status: 'absent' as const };
  }

  const checkIn = sorted[0];
  const checkOut = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const workingMinutes = checkOut ? Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / (1000 * 60))) : 0;

  const shiftStart = new Date(`${date}T10:00:00.000Z`);
  const lateFlag = checkIn.getTime() > shiftStart.getTime();
  const lateMinutes = lateFlag ? Math.floor((checkIn.getTime() - shiftStart.getTime()) / (1000 * 60)) : 0;

  let status: 'present' | 'half_day' | 'absent' | 'lop' = 'present';
  if (lateFlag) status = 'half_day';
  else if (workingMinutes < 360) status = 'half_day';

  return {
    check_in: checkIn,
    check_out: checkOut,
    working_minutes: workingMinutes,
    late_flag: lateFlag,
    late_minutes: lateMinutes,
    status
  };
};

export const attendanceProcessDayProcessor = async (job: any, publisher: Redis, connection: Redis) => {
  const tenant_id = String(job.data?.tenant_id || '').trim();
  const employee_code = String(job.data?.employee_code || '').trim();
  const date = String(job.data?.date || '').slice(0, 10);
  if (!tenant_id || !employee_code || !date) return;

  await prisma.$executeRaw(
    Prisma.sql`select ensure_attendance_days_partition(${new Date(date)}::date)`
  ).catch(() => {});

  const employee = await prisma.employees.findUnique({
    where: { tenant_id_employee_code: { tenant_id, employee_code } },
    select: { id: true, tenant_id: true }
  });
  if (!employee) return;

  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  const logs = await prisma.biometric_logs.findMany({
    where: {
      tenant_id,
      employee_code,
      punch_time: { gte: start, lte: end }
    },
    orderBy: { punch_time: 'asc' },
    select: { punch_time: true }
  });
  const punches = logs.map((l) => l.punch_time);
  const result = compute(date, punches);

  const upserted = await prisma.attendance_days.upsert({
    where: { employee_id_date: { employee_id: employee.id, date: new Date(date) } },
    create: {
      tenant_id,
      employee_id: employee.id,
      date: new Date(date),
      check_in: result.check_in,
      check_out: result.check_out,
      working_minutes: result.working_minutes,
      late_flag: result.late_flag,
      late_minutes: result.late_minutes,
      status: result.status,
      source: 'biometric'
    },
    update: {
      tenant_id,
      check_in: result.check_in,
      check_out: result.check_out,
      working_minutes: result.working_minutes,
      late_flag: result.late_flag,
      late_minutes: result.late_minutes,
      status: result.status,
      updated_at: new Date()
    }
  });

  const dt = new Date(date);
  const month = dt.getUTCMonth() + 1;
  const year = dt.getUTCFullYear();
  const q = new Queue(Queues.PAYROLL_RECALC_EMP_MONTH, { connection });
  await q.add(
    'recalc-employee-month',
    { tenant_id, employee_id: employee.id, month, year },
    { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true }
  );

  const totalEmployees = await prisma.employees.count({ where: { tenant_id, status: 'active' } as any });
  const dailyAgg = await prisma.$queryRaw<
    Array<{
      present_count: number;
      half_day_count: number;
      absent_count: number;
      lop_count: number;
    }>
  >(
    Prisma.sql`
      select
        count(*) filter (where status = 'present')::int as present_count,
        count(*) filter (where status in ('half_day', 'half day'))::int as half_day_count,
        count(*) filter (where status = 'absent')::int as absent_count,
        count(*) filter (where status = 'lop')::int as lop_count
      from attendance_days
      where tenant_id = ${tenant_id}::uuid and date = ${new Date(date)}::date
    `
  );
  const daily = dailyAgg[0] || { present_count: 0, half_day_count: 0, absent_count: 0, lop_count: 0 };
  await prisma.dashboard_daily_stats.upsert({
    where: { tenant_id_date: { tenant_id, date: new Date(date) } },
    create: {
      tenant_id,
      date: new Date(date),
      total_employees: totalEmployees,
      present_count: daily.present_count,
      half_day_count: daily.half_day_count,
      absent_count: daily.absent_count,
      lop_count: daily.lop_count
    },
    update: {
      total_employees: totalEmployees,
      present_count: daily.present_count,
      half_day_count: daily.half_day_count,
      absent_count: daily.absent_count,
      lop_count: daily.lop_count,
      updated_at: new Date()
    }
  });

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));
  await prisma.leaderboard_stats.deleteMany({ where: { tenant_id, year, month } as any });
  await prisma.$executeRaw(
    Prisma.sql`
      insert into leaderboard_stats (tenant_id, year, month, employee_id, score, rank, updated_at)
      with scores as (
        select
          employee_id,
          round(
            sum(
              case
                when status = 'present' then 1
                when status in ('half_day', 'half day') then 0.5
                else 0
              end
            )::numeric,
            2
          ) as score
        from attendance_days
        where tenant_id = ${tenant_id}::uuid and date >= ${monthStart}::date and date < ${nextMonth}::date
        group by employee_id
      ),
      ranked as (
        select
          employee_id,
          score,
          dense_rank() over (order by score desc) as rank
        from scores
      )
      select ${tenant_id}::uuid, ${year}::int, ${month}::int, employee_id, score, rank, now()
      from ranked
    `
  );

  const zkey = `leaderboard:z:${tenant_id}:${year}:${month}`;
  const scores = await prisma.leaderboard_stats.findMany({
    where: { tenant_id, year, month } as any,
    orderBy: [{ rank: 'asc' }],
    select: { employee_id: true, score: true }
  });
  const pipeline = (publisher as any).pipeline();
  pipeline.del(zkey);
  for (const s of scores) {
    pipeline.zadd(zkey, Number((s as any).score || 0), String((s as any).employee_id));
  }
  pipeline.expire(zkey, 120 * 24 * 60 * 60);
  await pipeline.exec().catch(() => {});

  await prisma.event_logs
    .create({
      data: {
        tenant_id,
        service: 'attendance-worker',
        type: 'attendance.day.updated',
        payload: { employee_code, date, status: upserted.status, year, month }
      }
    })
    .catch(() => {});

  await publisher.publish('attendance.live', JSON.stringify({ tenant_id, employee_code, date, status: upserted.status })).catch(() => {});
  await publisher.publish('events', JSON.stringify({ tenant_id, type: 'attendance.day.updated', employee_code, date })).catch(() => {});
  await publisher
    .publish(
      'cache.invalidate',
      JSON.stringify({
        keys: [`dashboard:daily:${tenant_id}:${date}`, `leaderboard:z:${tenant_id}:${year}:${month}`],
        prefixes: [`leaderboard:${tenant_id}:${year}:${month}:`],
        tags: [`http:attendance:${tenant_id}`, `http:admin:${tenant_id}`]
      })
    )
    .catch(() => {});
  await publisher.publish('dashboard.live', JSON.stringify({ tenant_id, date, ...daily, total_employees: totalEmployees })).catch(() => {});
  await publisher.publish('leaderboard.live', JSON.stringify({ tenant_id, year, month })).catch(() => {});
};
