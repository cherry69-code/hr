import type { FastifyInstance } from 'fastify';
import { registerBiometricController } from './controller';

export const registerBiometricRoutes = async (app: FastifyInstance) => {
  registerBiometricController(app);
};

