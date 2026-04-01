import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
};

export const httpMetrics = async (app: FastifyInstance) => {
  const d = app.metrics.durationsMs;
  const count = d.length;
  const avg = count ? d.reduce((a, b) => a + b, 0) / count : 0;
  return {
    ok: true as const,
    data: {
      started_at: new Date(app.metrics.startedAt).toISOString(),
      request_count: count,
      errors_5xx: app.metrics.errors5xx,
      latency_ms: {
        avg: Math.round(avg),
        p50: percentile(d, 50),
        p95: percentile(d, 95),
        p99: percentile(d, 99)
      }
    }
  };
};

const KNOWN_QUEUES = [
  'biometric.ingest',
  'attendance.processDay',
  'payroll.recalculateEmployeeMonth',
  'payroll.batch',
  'notifications.send',
  'biometric.ingest.dlq',
  'attendance.processDay.dlq',
  'payroll.recalculateEmployeeMonth.dlq',
  'payroll.batch.dlq',
  'notifications.send.dlq'
];

export const queueMetrics = async (app: FastifyInstance, queuesCsv?: string) => {
  const selected = queuesCsv
    ? queuesCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : KNOWN_QUEUES;

  const safe = selected.filter((n) => KNOWN_QUEUES.includes(n));
  const out: any[] = [];
  for (const name of safe) {
    const q = new Queue(name, { connection: app.redis });
    const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    out.push({ name, counts });
  }
  return { ok: true as const, data: out };
};

