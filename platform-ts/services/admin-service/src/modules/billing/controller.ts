import type { FastifyInstance } from 'fastify';
import type { CreatePlanBody, SetSubscriptionBody, UsageMonthQuery, UsageQuery } from './schema';
import { createPlan, getUsage, getUsageDailyDb, getUsageMonthDb, listPlans, setSubscription } from './service';

export const registerBillingController = (app: FastifyInstance) => {
  app.get('/api/admin/billing/plans', { preHandler: app.requireRole('super_admin') }, async () => {
    return listPlans(app);
  });

  app.post<{ Body: CreatePlanBody }>('/api/admin/billing/plans', { preHandler: app.requireRole('super_admin') }, async (req, reply) => {
    const result = await createPlan(app, req.body);
    if (!result.ok) return reply.code(400).send(result);
    await app.prisma.audit_logs
      .create({
        data: {
          tenant_id: String((req as any).tenantId),
          actor_user_id: (req as any).user?.sub ? String((req as any).user.sub) : null,
          actor_email: (req as any).user?.email ? String((req as any).user.email) : null,
          action: 'billing.plan.created',
          entity_type: 'subscription_plan',
          entity_id: String((result as any).data?.id || ''),
          meta: { code: (result as any).data?.code, name: (result as any).data?.name, limits: (result as any).data?.limits }
        }
      } as any)
      .catch(() => {});
    return result;
  });

  app.put<{ Body: SetSubscriptionBody }>('/api/admin/billing/subscription', { preHandler: app.requireRole('super_admin') }, async (req, reply) => {
    const result = await setSubscription(app, req.body);
    if (!result.ok) return reply.code(400).send(result);
    await app.prisma.audit_logs
      .create({
        data: {
          tenant_id: String((req as any).tenantId),
          actor_user_id: (req as any).user?.sub ? String((req as any).user.sub) : null,
          actor_email: (req as any).user?.email ? String((req as any).user.email) : null,
          action: 'billing.subscription.set',
          entity_type: 'tenant_subscription',
          entity_id: String((req as any).tenantId),
          meta: { tenant_id: (req as any).tenantId, plan_code: (req as any).body?.plan_code, status: (req as any).body?.status }
        }
      } as any)
      .catch(() => {});
    return result;
  });

  app.get<{ Querystring: UsageQuery }>('/api/admin/billing/usage', { preHandler: app.requireRole('hr_admin') }, async (req: any, reply) => {
    const result = await getUsage(app, String(req.tenantId), (req.query as any)?.date);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.get<{ Querystring: UsageQuery }>(
    '/api/admin/billing/usage-db/daily',
    { preHandler: app.requireRole('hr_admin') },
    async (req: any, reply) => {
      const result = await getUsageDailyDb(app, String(req.tenantId), (req.query as any)?.date);
      if (!result.ok) return reply.code(400).send(result);
      return result;
    }
  );

  app.get<{ Querystring: UsageMonthQuery }>(
    '/api/admin/billing/usage-db/month',
    { preHandler: app.requireRole('hr_admin') },
    async (req: any, reply) => {
      const result = await getUsageMonthDb(app, String(req.tenantId), req.query as any);
      if (!result.ok) return reply.code(400).send(result);
      return result;
    }
  );
};
