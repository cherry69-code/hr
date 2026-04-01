import type { FastifyInstance } from 'fastify';
import { registerSecurityController } from './controller';

export const registerSecurityRoutes = async (app: FastifyInstance) => {
  registerSecurityController(app);
};

