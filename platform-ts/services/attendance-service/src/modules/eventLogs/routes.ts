import type { FastifyInstance } from 'fastify';
import { registerEventLogsController } from './controller';

export const registerEventLogsRoutes = async (app: FastifyInstance) => {
  registerEventLogsController(app);
};

