import type { FastifyInstance } from 'fastify';
import { registerMetricsController } from './controller';

export const registerMetricsRoutes = async (app: FastifyInstance) => {
  registerMetricsController(app);
};

