import type { FastifyInstance } from 'fastify';

const redisKey = (tenantId: string) => `ff:${tenantId}`;

export const listFlags = async (app: FastifyInstance, tenantId: string) => {
  const rows = await app.prismaRead.feature_flags.findMany({ where: { tenant_id: tenantId } as any, orderBy: { key: 'asc' } });
  return { ok: true as const, data: rows };
};

export const setFlag = async (app: FastifyInstance, tenantId: string, key: string, enabled: boolean) => {
  const k = String(key || '').trim();
  if (!k) return { ok: false as const, error: 'invalid key' };
  const row = await app.prisma.feature_flags.upsert({
    where: { tenant_id_key: { tenant_id: tenantId, key: k } } as any,
    create: { tenant_id: tenantId, key: k, enabled: Boolean(enabled) } as any,
    update: { enabled: Boolean(enabled), updated_at: new Date() } as any
  });

  await app.redis.hset(redisKey(tenantId), k, enabled ? '1' : '0');
  await app.redis.publish('events', JSON.stringify({ type: 'feature_flag.updated', tenant_id: tenantId, key: k, enabled: Boolean(enabled) })).catch(() => {});
  return { ok: true as const, data: row };
};
