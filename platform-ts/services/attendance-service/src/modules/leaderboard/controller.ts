import type { FastifyInstance } from 'fastify';
import type { LeaderboardQuery } from './schema';
import { getLiveTop, getMonthly } from './service';

export const registerLeaderboardController = (app: FastifyInstance) => {
  app.get<{ Querystring: LeaderboardQuery }>('/leaderboard/monthly', { preHandler: app.requireAuth }, async (req, reply) => {
    const page = (req.query as any)?.page ? Number((req.query as any).page) : 1;
    const limit = (req.query as any)?.limit ? Number((req.query as any).limit) : 50;
    const result = await getMonthly(app, String((req as any).tenantId), {
      year: (req.query as any)?.year,
      month: (req.query as any)?.month,
      page,
      limit
    });
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.get<{ Querystring: LeaderboardQuery }>('/leaderboard/live', { preHandler: app.requireAuth }, async (req, reply) => {
    const result = await getLiveTop(app, String((req as any).tenantId), {
      year: (req.query as any)?.year,
      month: (req.query as any)?.month,
      limit: (req.query as any)?.limit
    });
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};
