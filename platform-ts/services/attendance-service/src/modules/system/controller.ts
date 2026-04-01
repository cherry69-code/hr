import type { FastifyInstance } from 'fastify';
import type { ModeBody } from './schema';
import { getMode, setMode } from './service';

export const registerSystemController = (app: FastifyInstance) => {
  app.get('/admin/system/mode', { preHandler: app.requireRole('hr_admin') }, async (req: any) => {
    return getMode(app, String(req.tenantId));
  });

  app.put<{ Body: ModeBody }>('/admin/system/mode', { preHandler: app.requireRole('hr_admin') }, async (req: any, reply) => {
    const result = await setMode(app, String(req.tenantId), req.body);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};
