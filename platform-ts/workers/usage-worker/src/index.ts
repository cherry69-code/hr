import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const url = String(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const connection = new Redis(url, { maxRetriesPerRequest: null });

const QUEUE_PERSIST = 'usage.persistDaily';
const DLQ_PERSIST = `${QUEUE_PERSIST}.dlq`;

const tenantsKey = (day: string) => `usage:tenants:${day}`;
const usageKey = (tenantId: string, day: string) => `usage:${tenantId}:${day}`;

const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (s: string) => new Date(`${s}T00:00:00.000Z`);

const persist = async (day: string) => {
  const tenants = await connection.smembers(tenantsKey(day)).catch(() => []);
  if (!tenants.length) return;

  for (const tenantId of tenants) {
    const h = await connection.hgetall(usageKey(tenantId, day)).catch(() => ({} as Record<string, string>));
    const services = new Set<string>();
    for (const k of Object.keys(h)) {
      if (k.endsWith(':requests')) services.add(k.slice(0, -':requests'.length));
      if (k.endsWith(':errors_5xx')) services.add(k.slice(0, -':errors_5xx'.length));
    }

    const date = parseDay(day);
    for (const service of services) {
      const requests = Number(h[`${service}:requests`] || 0);
      const errors_5xx = Number(h[`${service}:errors_5xx`] || 0);
      await prisma.tenant_usage_daily
        .upsert({
          where: { tenant_id_date_service: { tenant_id: tenantId, date, service } },
          create: { tenant_id: tenantId, date, service, requests, errors_5xx, updated_at: new Date() },
          update: { requests, errors_5xx, updated_at: new Date() }
        })
        .catch(() => {});
    }
  }
};

const dlq = new Queue(DLQ_PERSIST, { connection });

const persistQueue = new Queue(QUEUE_PERSIST, { connection });
persistQueue
  .add('persist', {}, { repeat: { every: 5 * 60 * 1000 }, jobId: 'usage-persist', removeOnComplete: true, removeOnFail: true })
  .catch(() => {});

const worker = new Worker(
  QUEUE_PERSIST,
  async () => {
    const now = new Date();
    const today = dayStr(now);
    const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterday = dayStr(y);
    await persist(today);
    await persist(yesterday);
  },
  { connection, concurrency: 1 }
);

worker.on('failed', async (job, err) => {
  const attempts = job?.opts?.attempts || 1;
  const attemptsMade = (job as any)?.attemptsMade ?? 0;
  if (attemptsMade >= attempts - 1) {
    await dlq.add('dlq', { queue: QUEUE_PERSIST, jobId: job?.id, data: job?.data, error: String(err?.message || err) }, { removeOnComplete: true });
  }
});

