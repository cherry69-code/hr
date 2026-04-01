import type { FastifyInstance } from 'fastify';
import { registerFeatureFlagsController } from './controller';

export const registerFeatureFlagsRoutes = async (app: FastifyInstance) => {
  registerFeatureFlagsController(app);
};

