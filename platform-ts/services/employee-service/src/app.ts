import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { dbPlugin } from './plugins/db';
import { redisPlugin } from './plugins/redis';
import { authPlugin } from './plugins/auth';
import { systemModePlugin } from './plugins/systemMode';
import { httpCachePlugin } from './plugins/httpCache';
import { prometheusPlugin } from './plugins/prometheus';
import { planEnforcementPlugin } from './plugins/planEnforcement';
import { usageTrackerPlugin } from './plugins/usageTracker';
import { securityPlugin } from './plugins/security';
import { registerEmployeeRoutes } from './modules/employee/routes';
import { subscribeCacheInvalidation } from './utils/cache';
import { registerAuditRoutes } from './modules/audit/routes';

export const buildApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(redisPlugin);
  await app.register(securityPlugin);
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute', redis: app.redis });
  await subscribeCacheInvalidation(app.redisSub, app.redis);
  await app.register(systemModePlugin);
  await app.register(dbPlugin);
  await app.register(jwt, { secret: String(process.env.JWT_SECRET || '') });
  await app.register(authPlugin);
  await app.register(planEnforcementPlugin);
  await app.register(compress);
  await app.register(prometheusPlugin);
  await app.register(httpCachePlugin);
  await app.register(usageTrackerPlugin);

  app.get('/health', async () => ({ ok: true }));
  await app.register(registerEmployeeRoutes);
  await app.register(registerAuditRoutes);

  return app;
};
