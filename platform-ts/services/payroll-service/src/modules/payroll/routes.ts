import type { FastifyInstance } from 'fastify';
import { registerPayrollController } from './controller';

export const registerPayrollRoutes = async (app: FastifyInstance) => {
  registerPayrollController(app);
};

