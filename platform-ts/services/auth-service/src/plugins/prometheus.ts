import fp from 'fastify-plugin';
import * as promClient from 'prom-client';

export const prometheusPlugin = fp(async (app) => {
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['service', 'method', 'route', 'status'] as const,
    registers: [register]
  });

  const httpRequestDurationMs = new promClient.Histogram({
    name: 'http_request_duration_ms',
    help: 'HTTP request duration (ms)',
    labelNames: ['service', 'method', 'route', 'status'] as const,
    buckets: [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [register]
  });

  app.addHook('onRequest', async (req: any) => {
    req._t0 = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (req: any, reply) => {
    const t0: bigint | undefined = req._t0;
    if (!t0) return;
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1_000_000;
    const route = String((req.routeOptions as any)?.url || String(req.url || '').split('?')[0]);
    const status = String(reply.statusCode);
    const labels = { service: 'auth-service', method: String(req.method), route, status };
    httpRequestsTotal.inc(labels);
    httpRequestDurationMs.observe(labels, elapsedMs);
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', register.contentType);
    return register.metrics();
  });
});

