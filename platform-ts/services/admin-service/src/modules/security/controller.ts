import type { FastifyInstance } from 'fastify';
import type { BlockIpBody } from './schema';
import { blockIp, listBlockedIps, unblockIp } from './service';

export const registerSecurityController = (app: FastifyInstance) => {
  app.get('/api/admin/security/ip-blocklist', { preHandler: app.requireRole('super_admin') }, async () => {
    return listBlockedIps(app);
  });

  app.post<{ Body: BlockIpBody }>('/api/admin/security/ip-blocklist', { preHandler: app.requireRole('super_admin') }, async (req: any, reply) => {
    const result = await blockIp(app, String(req.tenantId), req.user, req.body?.ip);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.delete('/api/admin/security/ip-blocklist/:ip', { preHandler: app.requireRole('super_admin') }, async (req: any, reply) => {
    const result = await unblockIp(app, String(req.tenantId), req.user, String(req.params?.ip || ''));
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });
};

