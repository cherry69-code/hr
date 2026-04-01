import type { FastifyInstance } from 'fastify';
import { registerSystemController } from './controller';

export const registerSystemRoutes = async (app: FastifyInstance) => {
  registerSystemController(app);
};

