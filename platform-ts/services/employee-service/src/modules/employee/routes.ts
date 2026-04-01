import type { FastifyInstance } from 'fastify';
import { registerEmployeeController } from './controller';

export const registerEmployeeRoutes = async (app: FastifyInstance) => {
  registerEmployeeController(app);
};

