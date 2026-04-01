import type { FastifyInstance } from 'fastify';
import { registerDashboardController } from './controller';

export const registerDashboardRoutes = async (app: FastifyInstance) => {
  registerDashboardController(app);
};

