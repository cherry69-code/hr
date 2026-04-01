import type { FastifyInstance } from 'fastify';
import { registerLeaderboardController } from './controller';

export const registerLeaderboardRoutes = async (app: FastifyInstance) => {
  registerLeaderboardController(app);
};

