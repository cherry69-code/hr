import type { FastifyInstance } from 'fastify';
import { listAuditLogs } from './repository';

export const getAuditLogs = async (app: FastifyInstance, tenantId: string, params: any) => {
  const take = Math.min(200, Math.max(1, params.limit ? Number(params.limit) : 50));
  const before = params.before ? new Date(String(params.before)) : new Date(Date.now() + 1000);
  if (Number.isNaN(before.getTime())) return { ok: false as const, error: 'invalid before' };

  const rows = await listAuditLogs(app.prismaRead, {
    tenantId,
    actor_user_id: params.actor_user_id ? String(params.actor_user_id) : undefined,
    actor_email: params.actor_email ? String(params.actor_email) : undefined,
    action: params.action ? String(params.action) : undefined,
    entity_type: params.entity_type ? String(params.entity_type) : undefined,
    entity_id: params.entity_id ? String(params.entity_id) : undefined,
    before,
    take
  });
  const next = rows.length ? rows[rows.length - 1].created_at.toISOString() : null;
  return { ok: true as const, data: rows, pagination: { limit: take, next } };
};
