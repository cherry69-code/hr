import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import websocket from '@fastify/websocket';
import { redisPlugin } from './plugins/redis';
import { dbPlugin } from './plugins/db';
import { authPlugin } from './plugins/auth';
import { prometheusPlugin } from './plugins/prometheus';
import { planEnforcementPlugin } from './plugins/planEnforcement';
import { usageTrackerPlugin } from './plugins/usageTracker';
import { securityPlugin } from './plugins/security';
import { registerWsRoutes } from './modules/ws/routes';
import { subscribeRedisAndBroadcast } from './modules/ws/service';

export const buildApp = async () => {
  const app = Fastify({ logger: true });
  const clients = new Set<any>();

  await app.register(redisPlugin);
  await app.register(securityPlugin);
  await app.register(rateLimit, { max: 800, timeWindow: '1 minute', redis: app.redis });
  await app.register(dbPlugin);
  await app.register(jwt, { secret: String(process.env.JWT_SECRET || '') });
  await app.register(authPlugin);
  await app.register(planEnforcementPlugin);
  await app.register(compress);
  await app.register(prometheusPlugin);
  await app.register(usageTrackerPlugin);
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));
  await registerWsRoutes(app, clients);
  await subscribeRedisAndBroadcast(app, clients, ['events', 'attendance.live', 'dashboard.live', 'leaderboard.live']);

  return app;
};
