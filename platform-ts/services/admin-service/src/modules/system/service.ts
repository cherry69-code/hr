import type { FastifyInstance } from 'fastify';
import type { ModeBody } from './schema';

export const getMode = async (app: FastifyInstance, tenantId: string) => {
  const raw = await app.redis.get(`system:${tenantId}:mode`);
  const mode = raw === 'maintenance' || raw === 'payroll_lock' || raw === 'normal' ? raw : 'normal';
  return { ok: true as const, data: { mode } };
};

export const setMode = async (app: FastifyInstance, tenantId: string, body: ModeBody) => {
  const mode = String((body as any)?.mode || '');
  if (mode !== 'normal' && mode !== 'payroll_lock' && mode !== 'maintenance') {
    return { ok: false as const, error: 'invalid mode' };
  }
  await app.redis.set(`system:${tenantId}:mode`, mode);
  await app.redis.publish('events', JSON.stringify({ type: 'system.mode.changed', tenant_id: tenantId, mode })).catch(() => {});
  await app.redis.publish('system.mode.changed', JSON.stringify({ tenant_id: tenantId, mode })).catch(() => {});
  return { ok: true as const, data: { mode } };
};
