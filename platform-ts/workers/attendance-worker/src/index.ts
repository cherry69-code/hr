import { createWorkerWithDlq } from './utils/workerFactory';
import { Queues } from './utils/queues';
import { biometricIngestProcessor } from './workers/biometricIngest';
import { attendanceProcessDayProcessor } from './workers/attendanceProcessDay';

createWorkerWithDlq(Queues.BIOMETRIC_INGEST, biometricIngestProcessor, { concurrency: 50, attempts: 5 });
createWorkerWithDlq(Queues.ATTENDANCE_PROCESS_DAY, attendanceProcessDayProcessor, { concurrency: 20, attempts: 5 });

process.on('SIGINT', () => process.exit(0));

