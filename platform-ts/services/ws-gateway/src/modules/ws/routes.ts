import type { FastifyInstance } from 'fastify';
import { registerWsController } from './controller';

export const registerWsRoutes = async (app: FastifyInstance, clients: Set<any>) => {
  registerWsController(app, clients);
};

