import type { FastifyInstance } from 'fastify';
import type { DashboardDailyQuery } from './schema';
import { getDaily } from './service';

export const registerDashboardController = (app: FastifyInstance) => {
  app.get<{ Querystring: DashboardDailyQuery }>('/dashboard/daily', { preHandler: app.requireAuth }, async (req, reply) => {
    const result = await getDaily(app, String((req as any).tenantId), (req.query as any)?.date);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.get('/dashboard/today', { preHandler: app.requireAuth }, async (req: any, reply) => {
    const result = await getDaily(app, String(req.tenantId));
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};
