import type { FastifyInstance } from 'fastify';
import type { BootstrapBody, LoginBody, LogoutBody, RefreshBody, TwoFactorDisableBody, TwoFactorEnableBody } from './schema';
import { bootstrapAdmin, disable2fa, enable2fa, login, logout, refresh, setup2fa } from './service';

export const registerAuthController = (app: FastifyInstance) => {
  app.post<{ Body: BootstrapBody }>('/bootstrap', async (req, reply) => {
    const result = await bootstrapAdmin(app, req.body);
    if (!result.ok) return reply.code(403).send(result);
    return reply.send(result);
  });

  app.post<{ Body: LoginBody }>('/login', async (req, reply) => {
    const result = await login(app, req.body);
    if (!result.ok) return reply.code(401).send(result);
    return reply.send(result);
  });

  app.post<{ Body: RefreshBody }>('/refresh', async (req, reply) => {
    const result = await refresh(app, req.body);
    if (!result.ok) return reply.code(401).send(result);
    return reply.send(result);
  });

  app.post<{ Body: LogoutBody }>('/logout', { preHandler: app.requireAuth }, async (req: any, reply) => {
    const result = await logout(app, String(req.tenantId), String(req.user?.sub), req.body);
    if (!result.ok) return reply.code(400).send(result);
    return reply.send(result);
  });

  app.post('/2fa/setup', { preHandler: app.requireAuth }, async (req: any, reply) => {
    const result = await setup2fa(app, String(req.tenantId), String(req.user?.sub));
    if (!result.ok) return reply.code(400).send(result);
    return reply.send(result);
  });

  app.post<{ Body: TwoFactorEnableBody }>('/2fa/enable', { preHandler: app.requireAuth }, async (req: any, reply) => {
    const result = await enable2fa(app, String(req.tenantId), String(req.user?.sub), req.body);
    if (!result.ok) return reply.code(400).send(result);
    return reply.send(result);
  });

  app.post<{ Body: TwoFactorDisableBody }>('/2fa/disable', { preHandler: app.requireAuth }, async (req: any, reply) => {
    const result = await disable2fa(app, String(req.tenantId), String(req.user?.sub), req.body);
    if (!result.ok) return reply.code(400).send(result);
    return reply.send(result);
  });
};
