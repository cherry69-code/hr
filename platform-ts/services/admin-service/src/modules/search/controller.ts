import type { FastifyInstance } from 'fastify';
import type { ReindexBody } from './schema';
import { health, reindex } from './service';

export const registerSearchController = (app: FastifyInstance) => {
  app.get('/api/admin/search/health', { preHandler: app.requireRole('hr_admin') }, async (_req, reply) => {
    const result = await health(app);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.post<{ Body: ReindexBody }>('/api/admin/search/reindex', { preHandler: app.requireRole('hr_admin') }, async (req: any, reply) => {
    const result = await reindex(app, String(req.tenantId), req.body as any);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};

