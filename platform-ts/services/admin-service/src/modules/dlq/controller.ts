import type { FastifyInstance } from 'fastify';
import type { DlqListQuery } from './schema';
import { listDlqJobs, listDlqQueues, retryDlqJob } from './service';

export const registerDlqController = (app: FastifyInstance) => {
  app.get('/api/admin/dlq/queues', { preHandler: app.requireRole('hr_admin') }, async () => {
    return listDlqQueues(app);
  });

  app.get<{ Querystring: DlqListQuery }>('/api/admin/dlq/:dlqName/jobs', { preHandler: app.requireRole('hr_admin') }, async (req: any, reply) => {
    const result = await listDlqJobs(app, { dlqName: req.params?.dlqName, ...(req.query as any) });
    if (!result.ok) return reply.code(result.error === 'unknown dlq' ? 404 : 400).send(result);
    return result;
  });

  app.post('/api/admin/dlq/:dlqName/jobs/:jobId/retry', { preHandler: app.requireRole('hr_admin') }, async (req: any, reply) => {
    const result = await retryDlqJob(app, { dlqName: req.params?.dlqName, jobId: req.params?.jobId });
    if (!result.ok) return reply.code(result.error === 'not found' ? 404 : 400).send(result);
    return result;
  });
};

