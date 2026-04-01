import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { redisPlugin } from './plugins/redis';
import { dbPlugin } from './plugins/db';
import { authPlugin } from './plugins/auth';
import { httpCachePlugin } from './plugins/httpCache';
import { prometheusPlugin } from './plugins/prometheus';
import { planEnforcementPlugin } from './plugins/planEnforcement';
import { usageTrackerPlugin } from './plugins/usageTracker';
import { securityPlugin } from './plugins/security';
import { registerNotificationRoutes } from './modules/notification/routes';
import { subscribeCacheInvalidation } from './utils/cache';

export const buildApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(redisPlugin);
  await app.register(securityPlugin);
  await app.register(rateLimit, { max: 800, timeWindow: '1 minute', redis: app.redis });
  await subscribeCacheInvalidation(app.redisSub, app.redis);
  await app.register(dbPlugin);
  await app.register(jwt, { secret: String(process.env.JWT_SECRET || '') });
  await app.register(authPlugin);
  await app.register(planEnforcementPlugin);
  await app.register(compress);
  await app.register(prometheusPlugin);
  await app.register(httpCachePlugin);
  await app.register(usageTrackerPlugin);

  app.get('/health', async () => ({ ok: true }));
  await app.register(registerNotificationRoutes);

  return app;
};
