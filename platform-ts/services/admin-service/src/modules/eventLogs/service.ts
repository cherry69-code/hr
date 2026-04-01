import type { FastifyInstance } from 'fastify';

export const getEventLogs = async (
  app: FastifyInstance,
  tenantId: string,
  params: { service?: string; type?: string; before?: string; limit?: string }
) => {
  const take = Math.min(200, Math.max(1, params.limit ? Number(params.limit) : 50));
  const before = params.before ? new Date(String(params.before)) : new Date(Date.now() + 1000);
  if (Number.isNaN(before.getTime())) return { ok: false as const, error: 'invalid before' };

  const rows = await app.prismaRead.event_logs.findMany({
    where: {
      tenant_id: tenantId,
      ...(params.service ? { service: String(params.service) } : {}),
      ...(params.type ? { type: String(params.type) } : {}),
      created_at: { lt: before }
    } as any,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take
  });
  const next = rows.length ? rows[rows.length - 1].created_at.toISOString() : null;
  return { ok: true as const, data: rows, pagination: { limit: take, next } };
};
