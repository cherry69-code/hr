import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { redisPlugin } from './plugins/redis';
import { dbPlugin } from './plugins/db';
import { authPlugin } from './plugins/auth';
import { metricsPlugin } from './plugins/metrics';
import { elasticsearchPlugin } from './plugins/elasticsearch';
import { httpCachePlugin } from './plugins/httpCache';
import { prometheusPlugin } from './plugins/prometheus';
import { planEnforcementPlugin } from './plugins/planEnforcement';
import { usageTrackerPlugin } from './plugins/usageTracker';
import { securityPlugin } from './plugins/security';
import { subscribeCacheInvalidation } from './utils/cache';
import { registerSystemRoutes } from './modules/system/routes';
import { registerEventLogsRoutes } from './modules/eventLogs/routes';
import { registerAuditRoutes } from './modules/audit/routes';
import { registerLeaderboardRoutes } from './modules/leaderboard/routes';
import { registerMetricsRoutes } from './modules/metrics/routes';
import { registerDlqRoutes } from './modules/dlq/routes';
import { registerPayrollSimulationRoutes } from './modules/payrollSimulation/routes';
import { registerSearchRoutes } from './modules/search/routes';
import { registerFeatureFlagsRoutes } from './modules/featureFlags/routes';
import { registerBillingRoutes } from './modules/billing/routes';
import { registerSecurityRoutes } from './modules/security/routes';

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
  await app.register(metricsPlugin);
  await app.register(elasticsearchPlugin);
  await app.register(compress);
  await app.register(prometheusPlugin);
  await app.register(httpCachePlugin);
  await app.register(usageTrackerPlugin);

  app.get('/health', async () => ({ ok: true }));

  await app.register(registerSystemRoutes);
  await app.register(registerEventLogsRoutes);
  await app.register(registerAuditRoutes);
  await app.register(registerLeaderboardRoutes);
  await app.register(registerMetricsRoutes);
  await app.register(registerDlqRoutes);
  await app.register(registerPayrollSimulationRoutes);
  await app.register(registerSearchRoutes);
  await app.register(registerFeatureFlagsRoutes);
  await app.register(registerBillingRoutes);
  await app.register(registerSecurityRoutes);

  return app;
};
