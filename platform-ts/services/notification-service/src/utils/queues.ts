import { Queue } from 'bullmq';
import type Redis from 'ioredis';

export const Queues = {
  NOTIFICATIONS_SEND: 'notifications.send'
} as const;

export const queue = (redis: Redis, name: string) => new Queue(name, { connection: redis });

