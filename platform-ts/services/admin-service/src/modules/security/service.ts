import type { FastifyInstance } from 'fastify';

const key = 'ip:blocklist';
const sanitizeIp = (ip: string) => String(ip || '').trim();

export const listBlockedIps = async (app: FastifyInstance) => {
  const ips = await app.redis.smembers(key).catch(() => []);
  return { ok: true as const, data: { ips } };
};

export const blockIp = async (app: FastifyInstance, tenantId: string, actor: any, ip: string) => {
  const v = sanitizeIp(ip);
  if (!v) return { ok: false as const, error: 'invalid ip' };
  await app.redis.sadd(key, v).catch(() => {});
  await app.prisma.audit_logs
    .create({
      data: {
        tenant_id: tenantId,
        actor_user_id: actor?.sub ? String(actor.sub) : null,
        actor_email: actor?.email ? String(actor.email) : null,
        action: 'security.ip.block',
        entity_type: 'ip',
        entity_id: v,
        meta: {}
      }
    } as any)
    .catch(() => {});
  return { ok: true as const };
};

export const unblockIp = async (app: FastifyInstance, tenantId: string, actor: any, ip: string) => {
  const v = sanitizeIp(ip);
  if (!v) return { ok: false as const, error: 'invalid ip' };
  await app.redis.srem(key, v).catch(() => {});
  await app.prisma.audit_logs
    .create({
      data: {
        tenant_id: tenantId,
        actor_user_id: actor?.sub ? String(actor.sub) : null,
        actor_email: actor?.email ? String(actor.email) : null,
        action: 'security.ip.unblock',
        entity_type: 'ip',
        entity_id: v,
        meta: {}
      }
    } as any)
    .catch(() => {});
  return { ok: true as const };
};

