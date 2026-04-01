import type { FastifyInstance } from 'fastify';
import type { AuditQuery } from './schema';
import { getAuditLogs } from './service';

export const registerAuditController = (app: FastifyInstance) => {
  app.get<{ Querystring: AuditQuery }>('/admin/audit-logs', { preHandler: app.requireRole('hr_admin') }, async (req, reply) => {
    const result = await getAuditLogs(app, String((req as any).tenantId), req.query as any);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};
