import type { FastifyInstance } from 'fastify';
import { registerAuditController } from './controller';

export const registerAuditRoutes = async (app: FastifyInstance) => {
  registerAuditController(app);
};

