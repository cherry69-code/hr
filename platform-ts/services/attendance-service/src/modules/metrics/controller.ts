import type { FastifyInstance } from 'fastify';
import type { MetricsQuery } from './schema';
import { httpMetrics, queueMetrics } from './service';

export const registerMetricsController = (app: FastifyInstance) => {
  app.get('/admin/metrics/http', { preHandler: app.requireRole('hr_admin') }, async () => {
    return httpMetrics(app);
  });

  app.get<{ Querystring: MetricsQuery }>('/admin/metrics/queues', { preHandler: app.requireRole('hr_admin') }, async (req) => {
    return queueMetrics(app, (req.query as any)?.queues);
  });
};
