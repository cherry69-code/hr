import type { FastifyInstance } from 'fastify';
import type { ModeBody } from './schema';
import { getMode, setMode } from './service';

export const registerSystemController = (app: FastifyInstance) => {
  app.get('/api/admin/system/mode', { preHandler: app.requireRole('hr_admin') }, async (req: any) => {
    return getMode(app, String(req.tenantId));
  });

  app.put<{ Body: ModeBody }>('/api/admin/system/mode', { preHandler: app.requireRole('hr_admin') }, async (req: any, reply) => {
    const result = await setMode(app, String(req.tenantId), req.body);
    if (!result.ok) return reply.code(400).send(result);
    await app.prisma.audit_logs
      .create({
        data: {
          tenant_id: String(req.tenantId),
          actor_user_id: req.user?.sub ? String(req.user.sub) : null,
          actor_email: req.user?.email ? String(req.user.email) : null,
          action: 'system.mode.set',
          entity_type: 'system_mode',
          entity_id: String(req.tenantId),
          meta: { mode: (req.body as any)?.mode, expires_at: (req.body as any)?.expires_at }
        }
      } as any)
      .catch(() => {});
    return result;
  });
};
