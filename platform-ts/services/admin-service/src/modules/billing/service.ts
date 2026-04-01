import type { FastifyInstance } from 'fastify';
import type { CreatePlanBody, SetSubscriptionBody } from './schema';

const usageKey = (tenantId: string, date: string) => `usage:${tenantId}:${date}`;
const planKey = (tenantId: string) => `plan:limits:${tenantId}`;

const normalizeLimits = (input: any) => {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const key = String(k || '').trim();
    const n = Number(v);
    if (!key) continue;
    if (!Number.isFinite(n) || n <= 0) continue;
    out[key] = n;
  }
  return out;
};

export const listPlans = async (app: FastifyInstance) => {
  const rows = await app.prismaRead.subscription_plans.findMany({ orderBy: { created_at: 'desc' } });
  return { ok: true as const, data: rows };
};

export const createPlan = async (app: FastifyInstance, body: CreatePlanBody) => {
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  if (!code || !name) return { ok: false as const, error: 'code and name required' };
  const price_cents = body.price_cents ? Number(body.price_cents) : 0;
  const active = body.active === undefined ? true : Boolean(body.active);
  const limits = normalizeLimits((body as any).limits);
  const row = await app.prisma.subscription_plans.create({ data: { code, name, price_cents, active, limits } as any });
  return { ok: true as const, data: row };
};

export const setSubscription = async (app: FastifyInstance, body: SetSubscriptionBody) => {
  const tenantId = String(body.tenant_id || '').trim();
  const planCode = String(body.plan_code || '').trim();
  const status = String(body.status || 'active').trim();
  if (!tenantId || !planCode) return { ok: false as const, error: 'tenant_id and plan_code required' };

  const plan = await app.prismaRead.subscription_plans.findUnique({ where: { code: planCode } });
  if (!plan) return { ok: false as const, error: 'plan not found' };

  const t = await app.prismaRead.tenants.findUnique({ where: { id: tenantId } });
  if (!t) return { ok: false as const, error: 'tenant not found' };

  const row = await app.prisma.tenant_subscriptions.upsert({
    where: { tenant_id: tenantId },
    create: { tenant_id: tenantId, plan_id: plan.id, status },
    update: { plan_id: plan.id, status, started_at: new Date() }
  });
  await app.redis
    .set(planKey(tenantId), JSON.stringify({ plan_code: plan.code, limits: (plan as any).limits || {} }), 'EX', 10 * 60)
    .catch(() => {});
  await app.redis.publish('plan.changed', JSON.stringify({ tenant_id: tenantId, plan_code: plan.code })).catch(() => {});
  return { ok: true as const, data: row };
};

export const getUsage = async (app: FastifyInstance, tenantId: string, dateStr?: string) => {
  const date = dateStr ? new Date(String(dateStr)) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false as const, error: 'invalid date' };
  const day = date.toISOString().slice(0, 10);
  const h = await app.redis.hgetall(usageKey(tenantId, day));
  return { ok: true as const, data: { tenant_id: tenantId, date: day, counters: h } };
};

export const getUsageDailyDb = async (app: FastifyInstance, tenantId: string, dateStr?: string) => {
  const date = dateStr ? new Date(String(dateStr)) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false as const, error: 'invalid date' };
  const day = date.toISOString().slice(0, 10);
  const d = new Date(`${day}T00:00:00.000Z`);

  const rows = await app.prismaRead.tenant_usage_daily.findMany({
    where: { tenant_id: tenantId, date: d } as any,
    orderBy: [{ service: 'asc' }]
  });
  const total = rows.reduce(
    (acc: any, r: any) => ({ requests: acc.requests + Number(r.requests || 0), errors_5xx: acc.errors_5xx + Number(r.errors_5xx || 0) }),
    { requests: 0, errors_5xx: 0 }
  );
  return { ok: true as const, data: { tenant_id: tenantId, date: day, rows, total } };
};

export const getUsageMonthDb = async (app: FastifyInstance, tenantId: string, params: { year?: string; month?: string }) => {
  const now = new Date();
  const year = params.year ? Number(params.year) : now.getUTCFullYear();
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1;
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return { ok: false as const, error: 'invalid year/month' };
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const rows = await app.prismaRead.tenant_usage_daily.findMany({
    where: { tenant_id: tenantId, date: { gte: start, lt: end } } as any,
    orderBy: [{ date: 'asc' }, { service: 'asc' }]
  });
  const total = rows.reduce(
    (acc: any, r: any) => ({ requests: acc.requests + Number(r.requests || 0), errors_5xx: acc.errors_5xx + Number(r.errors_5xx || 0) }),
    { requests: 0, errors_5xx: 0 }
  );
  return { ok: true as const, data: { tenant_id: tenantId, year, month, rows, total } };
};
