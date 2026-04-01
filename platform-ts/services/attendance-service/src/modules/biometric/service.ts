import type { FastifyInstance } from 'fastify';
import * as crypto from 'crypto';
import { Queues, queue } from '../../utils/queues';
import { getDeviceById, insertLog, listLogs } from './repository';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export const ingest = async (app: FastifyInstance, body: any, token: string) => {
  const employee_code = String(body.employee_code || '').trim();
  const device_id = String(body.device_id || '').trim();
  const timestamp = String(body.timestamp || '').trim();
  if (!employee_code || !device_id || !timestamp) {
    return { ok: false as const, error: 'employee_code, device_id, timestamp required' };
  }

  const device = await getDeviceById(app.prisma, device_id);
  if (!device || device.status !== 'active') return { ok: false as const, error: 'invalid device' };
  const tenant_id = String((device as any).tenant_id || '').trim() || '00000000-0000-0000-0000-000000000001';

  if (device.token_hash) {
    if (!token) return { ok: false as const, error: 'missing device token' };
    if (sha256(token) !== device.token_hash) return { ok: false as const, error: 'invalid device token' };
  }

  const punch_time = new Date(timestamp.replace(' ', 'T'));
  if (Number.isNaN(punch_time.getTime())) return { ok: false as const, error: 'invalid timestamp' };

  await insertLog(app.prisma, {
    tenant_id,
    employee_code,
    punch_time,
    device_id,
    punch_type: body.punch_type ? String(body.punch_type) : null,
    verification_type: body.verification_type ? String(body.verification_type) : null,
    source: 'push',
    raw_payload: (body.raw_payload ?? body) as any
  });

  const q = queue(app.redis, Queues.BIOMETRIC_INGEST);
  await q.add(
    'biometric-ingest',
    { tenant_id, employee_code, punch_time: punch_time.toISOString(), device_id },
    { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true }
  );

  return { ok: true as const };
};

export const getLogs = async (app: FastifyInstance, tenantId: string, params: { employeeCode?: string; deviceId?: string; page: number; limit: number }) => {
  const page = Math.max(1, params.page);
  const limit = Math.min(200, Math.max(1, params.limit));
  const skip = (page - 1) * limit;
  const data = await listLogs(app.prismaRead, { tenantId, employeeCode: params.employeeCode, deviceId: params.deviceId, skip, take: limit });
  return { ok: true as const, data, pagination: { page, limit } };
};
