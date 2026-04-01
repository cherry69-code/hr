import type { FastifyInstance } from 'fastify';
import type { SendBody } from './schema';
import { send } from './service';

export const registerNotificationController = (app: FastifyInstance) => {
  app.post<{ Body: SendBody }>('/send', { preHandler: app.requireAuth }, async (req, reply) => {
    const result = await send(app, req.body);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};

