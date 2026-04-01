import type { FastifyInstance } from 'fastify';
import { registerBillingController } from './controller';

export const registerBillingRoutes = async (app: FastifyInstance) => {
  registerBillingController(app);
};

