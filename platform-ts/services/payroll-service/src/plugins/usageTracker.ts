import fp from 'fastify-plugin';

const serviceName = 'payroll-service';
const usageKey = (tenantId: string, day: string) => `usage:${tenantId}:${day}`;
const tenantsKey = (day: string) => `usage:tenants:${day}`;

export const usageTrackerPlugin = fp(async (app) => {
  app.addHook('onResponse', async (req: any, reply) => {
    const url = String(req.url || '');
    if (url.startsWith('/health')) return;
    if (url.startsWith('/metrics')) return;
    const tenantId = String(req.tenantId || '').trim();
    if (!tenantId) return;

    const day = new Date().toISOString().slice(0, 10);
    const k = usageKey(tenantId, day);
    const is5xx = reply.statusCode >= 500 && reply.statusCode < 600;

    const p: any = (app.redis as any).pipeline();
    p.hincrby(k, `${serviceName}:requests`, 1);
    p.hincrby(k, `total:requests`, 1);
    if (is5xx) {
      p.hincrby(k, `${serviceName}:errors_5xx`, 1);
      p.hincrby(k, `total:errors_5xx`, 1);
    }
    p.sadd(tenantsKey(day), tenantId);
    p.expire(k, 35 * 24 * 60 * 60);
    p.expire(tenantsKey(day), 35 * 24 * 60 * 60);
    await p.exec().catch(() => {});
  });
});

