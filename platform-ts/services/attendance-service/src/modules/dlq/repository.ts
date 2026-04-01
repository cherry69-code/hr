import { Queue } from 'bullmq';
import type Redis from 'ioredis';

export const getQueue = (redis: Redis, name: string) => new Queue(name, { connection: redis });

