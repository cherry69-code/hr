import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Queues } from '../utils/queues';

export const biometricIngestProcessor = async (job: any, publisher: Redis, connection: Redis) => {
  const tenant_id = String(job.data?.tenant_id || '').trim();
  const employee_code = String(job.data?.employee_code || '').trim();
  const punch_time = String(job.data?.punch_time || '').trim();
  if (!tenant_id || !employee_code || !punch_time) return;

  const dt = new Date(punch_time);
  if (Number.isNaN(dt.getTime())) return;
  const date = dt.toISOString().slice(0, 10);

  const q = new Queue(Queues.ATTENDANCE_PROCESS_DAY, { connection });
  await q.add(
    'process-day',
    { tenant_id, employee_code, date },
    { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true }
  );

  await publisher.publish('events', JSON.stringify({ tenant_id, type: 'biometric.ingested', employee_code, date })).catch(() => {});
};
