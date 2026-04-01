import type { FastifyInstance } from 'fastify';
import { Queues, queue } from '../../utils/queues';

export const send = async (app: FastifyInstance, body: { to: string; subject: string; text?: string }) => {
  const to = String(body.to || '').trim();
  const subject = String(body.subject || '').trim();
  const text = body.text ? String(body.text) : '';
  if (!to || !subject) return { ok: false as const, error: 'to and subject required' };

  const q = queue(app.redis, Queues.NOTIFICATIONS_SEND);
  await q.add(
    'send',
    { to, subject, text },
    { attempts: 8, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true }
  );

  return { ok: true as const, queued: true };
};

