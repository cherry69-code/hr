import { Queue } from 'bullmq';
import type Redis from 'ioredis';

export const Queues = {
  BIOMETRIC_INGEST: 'biometric.ingest',
  ATTENDANCE_PROCESS_DAY: 'attendance.processDay',
  ATTENDANCE_REBUILD_RANGE: 'attendance.rebuildRange',
  PAYROLL_RECALC_EMP_MONTH: 'payroll.recalculateEmployeeMonth'
} as const;

export const queue = (redis: Redis, name: string) => new Queue(name, { connection: redis });

