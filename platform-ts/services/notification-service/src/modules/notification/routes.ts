import type { FastifyInstance } from 'fastify';
import { registerNotificationController } from './controller';

export const registerNotificationRoutes = async (app: FastifyInstance) => {
  registerNotificationController(app);
};

