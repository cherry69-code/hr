import type { FastifyInstance } from 'fastify';
import { registerDlqController } from './controller';

export const registerDlqRoutes = async (app: FastifyInstance) => {
  registerDlqController(app);
};

