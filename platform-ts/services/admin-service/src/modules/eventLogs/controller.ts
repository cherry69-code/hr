import type { FastifyInstance } from 'fastify';
import type { EventLogsQuery } from './schema';
import { getEventLogs } from './service';

export const registerEventLogsController = (app: FastifyInstance) => {
  app.get<{ Querystring: EventLogsQuery }>('/api/admin/event-logs', { preHandler: app.requireRole('hr_admin') }, async (req: any, reply) => {
    const result = await getEventLogs(app, String(req.tenantId), req.query as any);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};

