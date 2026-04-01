import { Queue } from 'bullmq';
import type Redis from 'ioredis';

export const queue = (redis: Redis, name: string) => new Queue(name, { connection: redis });

