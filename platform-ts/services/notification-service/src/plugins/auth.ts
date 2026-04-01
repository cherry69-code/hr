import fp from 'fastify-plugin';

export type Role = 'super_admin' | 'hr_admin' | 'manager' | 'employee';

const normalizeRole = (role: unknown): Role => {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return 'super_admin';
  if (r === 'super_admin') return 'super_admin';
  if (r === 'hr_admin') return 'hr_admin';
  if (r === 'manager') return 'manager';
  return 'employee';
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email?: string; role?: string; tenant_id?: string };
    user: { sub: string; email?: string; role?: string; tenant_id?: string };
  }
}

export const authPlugin = fp(async (app) => {
  app.addHook('onRequest', async (req: any) => {
    const hasAuth = Boolean(String(req.headers?.authorization || '').trim());
    if (!hasAuth) return;
    try {
      await req.jwtVerify();
    } catch {
      return;
    }
    const tenantId = String(req.user?.tenant_id || '').trim();
    if (!tenantId) return;
    req.tenantId = tenantId;
    req.role = normalizeRole(req.user?.role);
  });

  app.decorate('requireAuth', async (req: any, reply: any) => {
    if (!req.user?.sub) {
      try {
        await req.jwtVerify();
      } catch {
        reply.code(401).send({ ok: false, error: 'unauthorized' });
        return;
      }
    }
    const tenantId = String(req.user?.tenant_id || '').trim();
    if (!tenantId) {
      reply.code(401).send({ ok: false, error: 'tenant_required' });
      return;
    }
    req.tenantId = tenantId;
    req.role = normalizeRole(req.user?.role);
  });
});

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    role?: Role;
  }
  interface FastifyInstance {
    requireAuth: (req: any, reply: any) => Promise<void>;
  }
}
