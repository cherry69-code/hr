import type { FastifyInstance } from 'fastify';
import type { LeaderboardQuery } from './schema';
import { getLiveTop, getMonthlyLeaderboard } from './service';

export const registerLeaderboardController = (app: FastifyInstance) => {
  app.get<{ Querystring: LeaderboardQuery }>('/api/admin/leaderboard/monthly', { preHandler: app.requireRole('manager') }, async (req: any, reply) => {
    const result = await getMonthlyLeaderboard(app, String(req.tenantId), req.query as any);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.get<{ Querystring: LeaderboardQuery }>('/api/admin/leaderboard/live', { preHandler: app.requireRole('manager') }, async (req: any, reply) => {
    const result = await getLiveTop(app, String(req.tenantId), req.query as any);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};

