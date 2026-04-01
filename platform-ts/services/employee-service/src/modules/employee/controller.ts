import type { FastifyInstance } from 'fastify';
import type { CreateEmployeeBody, UpdateEmployeeBody } from './schema';
import { create, getById, list, remove, update } from './service';

export const registerEmployeeController = (app: FastifyInstance) => {
  app.get('/', { preHandler: app.requireAuth }, async (req: any) => {
    const page = req.query?.page ? Number(req.query.page) : 1;
    const limit = req.query?.limit ? Number(req.query.limit) : 50;
    const q = req.query?.q ? String(req.query.q) : undefined;
    return list(app, String(req.tenantId), { page, limit, q });
  });

  app.get('/:id', { preHandler: app.requireAuth }, async (req: any, reply) => {
    const id = String(req.params?.id || '');
    const result = await getById(app, String(req.tenantId), id);
    if (!result.ok) return reply.code(404).send(result);
    return result;
  });

  app.post<{ Body: CreateEmployeeBody }>('/', { preHandler: app.requireAuth }, async (req, reply) => {
    const result = await create(app, String((req as any).tenantId), req.body, { userId: req.user?.sub, email: req.user?.email });
    if (!result.ok) return reply.code(400).send(result);
    return reply.code(201).send(result);
  });

  app.put<{ Body: UpdateEmployeeBody }>('/:id', { preHandler: app.requireAuth }, async (req: any) => {
    const id = String(req.params?.id || '');
    return update(app, String(req.tenantId), id, req.body, { userId: req.user?.sub, email: req.user?.email });
  });

  app.delete('/:id', { preHandler: app.requireAuth }, async (req: any) => {
    const id = String(req.params?.id || '');
    return remove(app, String(req.tenantId), id, { userId: req.user?.sub, email: req.user?.email });
  });
};
