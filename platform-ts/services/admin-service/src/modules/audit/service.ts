import type { FastifyInstance } from 'fastify';

export const getAuditLogs = async (app: FastifyInstance, tenantId: string, params: any) => {
  const take = Math.min(200, Math.max(1, params.limit ? Number(params.limit) : 50));
  const before = params.before ? new Date(String(params.before)) : new Date(Date.now() + 1000);
  if (Number.isNaN(before.getTime())) return { ok: false as const, error: 'invalid before' };

  const rows = await app.prismaRead.audit_logs.findMany({
    where: {
      tenant_id: tenantId,
      ...(params.actor_user_id ? { actor_user_id: String(params.actor_user_id) } : {}),
      ...(params.actor_email ? { actor_email: String(params.actor_email) } : {}),
      ...(params.action ? { action: String(params.action) } : {}),
      ...(params.entity_type ? { entity_type: String(params.entity_type) } : {}),
      ...(params.entity_id ? { entity_id: String(params.entity_id) } : {}),
      created_at: { lt: before }
    } as any,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take
  });
  const next = rows.length ? rows[rows.length - 1].created_at.toISOString() : null;
  return { ok: true as const, data: rows, pagination: { limit: take, next } };
};
