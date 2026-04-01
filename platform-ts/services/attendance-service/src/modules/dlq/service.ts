import type { FastifyInstance } from 'fastify';
import { getQueue } from './repository';

const ALLOWED: Record<string, string> = {
  'biometric.ingest.dlq': 'biometric.ingest',
  'attendance.processDay.dlq': 'attendance.processDay',
  'payroll.recalculateEmployeeMonth.dlq': 'payroll.recalculateEmployeeMonth',
  'payroll.batch.dlq': 'payroll.batch',
  'payroll.incentive.calculate.dlq': 'payroll.incentive.calculate',
  'payroll.precomputeMonth.dlq': 'payroll.precomputeMonth',
  'notifications.send.dlq': 'notifications.send'
};

const sanitize = (name: string) => String(name || '').trim();

export const listDlqQueues = async (app: FastifyInstance) => {
  const out: Array<{ name: string; original: string; counts: Record<string, number> }> = [];
  for (const [dlq, original] of Object.entries(ALLOWED)) {
    const q = getQueue(app.redis, dlq);
    const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    out.push({ name: dlq, original, counts });
  }
  return { ok: true as const, data: out };
};

export const listDlqJobs = async (
  app: FastifyInstance,
  params: { dlqName: string; status?: string; page?: string; limit?: string }
) => {
  const dlqName = sanitize(params.dlqName);
  if (!ALLOWED[dlqName]) return { ok: false as const, error: 'unknown dlq' };
  const statusRaw = sanitize(params.status || 'waiting');
  const status =
    statusRaw === 'waiting' || statusRaw === 'delayed' || statusRaw === 'failed' || statusRaw === 'completed'
      ? statusRaw
      : 'waiting';
  const page = Math.max(1, params.page ? Number(params.page) : 1);
  const limit = Math.min(200, Math.max(1, params.limit ? Number(params.limit) : 50));
  const start = (page - 1) * limit;
  const end = start + limit - 1;
  const q = getQueue(app.redis, dlqName);
  const jobs = await q.getJobs([status], start, end, true);
  const data = jobs.map((j) => ({
    id: j.id,
    name: j.name,
    data: j.data,
    opts: j.opts,
    attemptsMade: j.attemptsMade,
    failedReason: j.failedReason,
    timestamp: j.timestamp
  }));
  return { ok: true as const, data, pagination: { page, limit, status } };
};

export const retryDlqJob = async (app: FastifyInstance, params: { dlqName: string; jobId: string }) => {
  const dlqName = sanitize(params.dlqName);
  const jobId = sanitize(params.jobId);
  const original = ALLOWED[dlqName];
  if (!original) return { ok: false as const, error: 'unknown dlq' };

  const dlq = getQueue(app.redis, dlqName);
  const job = await dlq.getJob(jobId);
  if (!job) return { ok: false as const, error: 'not found' };

  const targetQueue = sanitize(job.data?.queue || original);
  if (targetQueue !== original) return { ok: false as const, error: 'invalid target' };

  const payload = job.data?.data ?? job.data;
  const q = getQueue(app.redis, original);
  const enqueued = await q.add('retry', payload, { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true });

  await job.remove();
  await app.prisma.event_logs
    .create({
      data: {
        tenant_id: String((job.data as any)?.tenant_id || '00000000-0000-0000-0000-000000000001'),
        service: 'attendance-service',
        type: 'dlq.retried',
        payload: { dlq: dlqName, original, jobId, newJobId: enqueued.id }
      }
    } as any)
    .catch(() => {});

  return { ok: true as const, data: { original, newJobId: enqueued.id } };
};

export const deleteDlqJob = async (app: FastifyInstance, params: { dlqName: string; jobId: string }) => {
  const dlqName = sanitize(params.dlqName);
  const jobId = sanitize(params.jobId);
  if (!ALLOWED[dlqName]) return { ok: false as const, error: 'unknown dlq' };
  const dlq = getQueue(app.redis, dlqName);
  const job = await dlq.getJob(jobId);
  if (!job) return { ok: false as const, error: 'not found' };
  await job.remove();
  return { ok: true as const };
};
