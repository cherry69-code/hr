import { Queue, Worker, type JobsOptions } from 'bullmq';
import Redis from 'ioredis';

export const createConnections = () => {
  const url = String(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  const publisher = new Redis(url, { maxRetriesPerRequest: null });
  return { connection, publisher };
};

export const createWorkerWithDlq = <T>(
  queueName: string,
  processor: (job: any, publisher: Redis, connection: Redis) => Promise<void>,
  opts?: { concurrency?: number; attempts?: number }
) => {
  const { connection, publisher } = createConnections();
  const dlq = new Queue(`${queueName}.dlq`, { connection });

  const worker = new Worker<T>(
    queueName,
    async (job) => {
      await processor(job, publisher, connection);
    },
    {
      connection,
      concurrency: opts?.concurrency || 20
    }
  );

  worker.on('failed', async (job, err) => {
    const attempts = (job?.opts as JobsOptions | undefined)?.attempts || opts?.attempts || 1;
    const attemptsMade = (job as any)?.attemptsMade ?? 0;
    if (attemptsMade >= attempts - 1) {
      await dlq.add(
        'dlq',
        { queue: queueName, jobId: job?.id, data: job?.data, error: String(err?.message || err) },
        { removeOnComplete: true }
      );
    }
  });

  return { worker, connection, publisher };
};
