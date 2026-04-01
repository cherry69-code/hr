import fp from 'fastify-plugin';
import * as promClient from 'prom-client';

export const prometheusPlugin = fp(async (app) => {
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  const tenantRequestsToday = new promClient.Gauge({
    name: 'tenant_requests_today',
    help: 'Tenant total requests for today (from Redis usage counters)',
    labelNames: ['tenant_id'] as const,
    registers: [register]
  });

  const tenantErrors5xxToday = new promClient.Gauge({
    name: 'tenant_errors_5xx_today',
    help: 'Tenant total 5xx for today (from Redis usage counters)',
    labelNames: ['tenant_id'] as const,
    registers: [register]
  });

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
    const labels = { service: 'admin-service', method: String(req.method), route, status };
    httpRequestsTotal.inc(labels);
    httpRequestDurationMs.observe(labels, elapsedMs);
  });

  app.get('/metrics', async (_req, reply) => {
    const day = new Date().toISOString().slice(0, 10);
    const tenants = await app.redis.smembers(`usage:tenants:${day}`).catch(() => []);
    const capped = tenants.slice(0, 200);
    if (capped.length) {
      const p: any = (app.redis as any).pipeline();
      for (const t of capped) p.hmget(`usage:${t}:${day}`, 'total:requests', 'total:errors_5xx');
      const res = (await p.exec().catch(() => [])) as any[];
      const rows: Array<{ tenant_id: string; requests: number; errors: number }> = [];
      for (let i = 0; i < capped.length; i++) {
        const v = res?.[i]?.[1] || [];
        const requests = Number(v?.[0] || 0);
        const errors = Number(v?.[1] || 0);
        rows.push({ tenant_id: String(capped[i]), requests, errors });
      }
      rows.sort((a, b) => b.requests - a.requests);
      const top = rows.slice(0, 100);
      tenantRequestsToday.reset();
      tenantErrors5xxToday.reset();
      for (const r of top) {
        tenantRequestsToday.set({ tenant_id: r.tenant_id }, r.requests);
        tenantErrors5xxToday.set({ tenant_id: r.tenant_id }, r.errors);
      }
    }
    reply.header('content-type', register.contentType);
    return register.metrics();
  });
});
