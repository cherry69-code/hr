import type { FastifyInstance } from 'fastify';
import { registerSearchController } from './controller';

export const registerSearchRoutes = async (app: FastifyInstance) => {
  registerSearchController(app);
};

