import { Queue } from 'bullmq';
import type Redis from 'ioredis';

export const Queues = {
  PAYROLL_RECALC_EMP_MONTH: 'payroll.recalculateEmployeeMonth',
  PAYROLL_RUN_MONTH: 'payroll.runMonth',
  PAYROLL_INCENTIVE_CALC: 'payroll.incentive.calculate'
} as const;

export const queue = (redis: Redis, name: string) => new Queue(name, { connection: redis });
