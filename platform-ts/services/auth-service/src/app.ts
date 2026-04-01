import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { dbPlugin } from './plugins/db';
import { redisPlugin } from './plugins/redis';
import { prometheusPlugin } from './plugins/prometheus';
import { authPlugin } from './plugins/auth';
import { planEnforcementPlugin } from './plugins/planEnforcement';
import { usageTrackerPlugin } from './plugins/usageTracker';
import { securityPlugin } from './plugins/security';
import { registerAuthRoutes } from './modules/auth/routes';

export const buildApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(redisPlugin);
  await app.register(securityPlugin);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    redis: app.redis
  });

  await app.register(dbPlugin);
  await app.register(jwt, { secret: String(process.env.JWT_SECRET || '') });
  await app.register(authPlugin);
  await app.register(planEnforcementPlugin);
  await app.register(compress);
  await app.register(prometheusPlugin);
  await app.register(usageTrackerPlugin);

  app.get('/health', async () => ({ ok: true }));
  await app.register(registerAuthRoutes);

  return app;
};
