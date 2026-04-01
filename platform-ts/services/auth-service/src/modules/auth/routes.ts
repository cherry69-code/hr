import type { FastifyInstance } from 'fastify';
import { registerAuthController } from './controller';

export const registerAuthRoutes = async (app: FastifyInstance) => {
  registerAuthController(app);
};

