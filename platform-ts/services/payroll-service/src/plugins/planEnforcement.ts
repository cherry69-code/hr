import fp from 'fastify-plugin';

type Limits = { requests_per_day?: number };

const keyPlan = (tenantId: string) => `plan:limits:${tenantId}`;
const keyUsage = (tenantId: string, day: string) => `usage:${tenantId}:${day}`;

export const planEnforcementPlugin = fp(async (app) => {
  const cache = new Map<string, { limits: Limits; ts: number }>();

  const readLimits = async (tenantId: string): Promise<Limits | null> => {
    const c = cache.get(tenantId);
    if (c && Date.now() - c.ts < 30000) return c.limits;
    const raw = await app.redis.get(keyPlan(tenantId)).catch(() => null);
    if (!raw) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const limits: Limits = parsed?.limits && typeof parsed.limits === 'object' ? parsed.limits : {};
    cache.set(tenantId, { limits, ts: Date.now() });
    return limits;
  };

  app.addHook('onRequest', async (req: any, reply) => {
    const url = String(req.url || '');
    if (url.startsWith('/health')) return;
    if (url.startsWith('/metrics')) return;

    const tenantId = String(req.tenantId || '').trim();
    if (!tenantId) return;
    if (String(req.role || '') === 'super_admin') return;

    const limits = await readLimits(tenantId);
    const max = limits?.requests_per_day ? Number(limits.requests_per_day) : 0;
    if (!max || !Number.isFinite(max) || max <= 0) return;

    const day = new Date().toISOString().slice(0, 10);
    const used = Number((await app.redis.hget(keyUsage(tenantId, day), 'total:requests').catch(() => '0')) || 0);
    if (used >= max) reply.code(429).send({ ok: false, error: 'plan_limit_exceeded' });
  });
});

