import type { FastifyInstance } from 'fastify';
import type { SetFlagBody } from './schema';
import { listFlags, setFlag } from './service';

export const registerFeatureFlagsController = (app: FastifyInstance) => {
  app.get('/api/admin/feature-flags', { preHandler: app.requireRole('super_admin') }, async (req: any) => {
    return listFlags(app, String(req.tenantId));
  });

  app.put<{ Body: SetFlagBody }>('/api/admin/feature-flags/:key', { preHandler: app.requireRole('super_admin') }, async (req: any, reply) => {
    const result = await setFlag(app, String(req.tenantId), String(req.params?.key || ''), Boolean(req.body?.enabled));
    if (!result.ok) return reply.code(400).send(result);
    await app.prisma.audit_logs
      .create({
        data: {
          tenant_id: String(req.tenantId),
          actor_user_id: req.user?.sub ? String(req.user.sub) : null,
          actor_email: req.user?.email ? String(req.user.email) : null,
          action: 'feature_flag.set',
          entity_type: 'feature_flag',
          entity_id: String(req.params?.key || ''),
          meta: { key: String(req.params?.key || ''), enabled: Boolean(req.body?.enabled) }
        }
      } as any)
      .catch(() => {});
    return result;
  });
};
