import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const url = String(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const connection = new Redis(url, { maxRetriesPerRequest: null });

const QUEUE = 'notifications.send';
const DLQ = `${QUEUE}.dlq`;
const dlq = new Queue(DLQ, { connection });

const worker = new Worker(
  QUEUE,
  async (job) => {
    const to = String(job.data?.to || '').trim();
    const subject = String(job.data?.subject || '').trim();
    const text = String(job.data?.text || '');
    if (!to || !subject) return;
    process.stdout.write(JSON.stringify({ ok: true, to, subject, text, ts: Date.now() }) + '\n');
  },
  { connection, concurrency: 50 }
);

worker.on('failed', async (job, err) => {
  const attempts = job?.opts?.attempts || 1;
  const attemptsMade = (job as any)?.attemptsMade ?? 0;
  if (attemptsMade >= attempts - 1) {
    await dlq.add(
      'dlq',
      { queue: QUEUE, jobId: job?.id, data: job?.data, error: String(err?.message || err) },
      { removeOnComplete: true }
    );
  }
});

process.on('SIGINT', () => process.exit(0));

