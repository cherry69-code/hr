import type { FastifyInstance } from 'fastify';
import { listEventLogs } from './repository';

export const getEventLogs = async (
  app: FastifyInstance,
  tenantId: string,
  params: { service?: string; type?: string; before?: string; limit?: string }
) => {
  const take = Math.min(200, Math.max(1, params.limit ? Number(params.limit) : 50));
  const before = params.before ? new Date(String(params.before)) : new Date(Date.now() + 1000);
  if (Number.isNaN(before.getTime())) return { ok: false as const, error: 'invalid before' };

  const rows = await listEventLogs(app.prismaRead, {
    tenantId,
    service: params.service ? String(params.service) : undefined,
    type: params.type ? String(params.type) : undefined,
    before,
    take
  });
  const nextCursor = rows.length ? rows[rows.length - 1].created_at.toISOString() : null;
  return { ok: true as const, data: rows, pagination: { limit: take, next: nextCursor } };
};
