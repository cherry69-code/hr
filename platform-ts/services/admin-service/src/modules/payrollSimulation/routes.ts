import type { FastifyInstance } from 'fastify';
import { registerPayrollSimulationController } from './controller';

export const registerPayrollSimulationRoutes = async (app: FastifyInstance) => {
  registerPayrollSimulationController(app);
};

