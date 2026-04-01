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

const order: Record<Role, number> = { employee: 1, manager: 2, hr_admin: 3, super_admin: 4 };

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

  app.decorate('requireRole', (minRole: Role) => {
    return async (req: any, reply: any) => {
      await app.requireAuth(req, reply);
      if (reply.sent) return;
      const role: Role = req.role ? (req.role as Role) : 'employee';
      const current = order[role] || 0;
      if (current < order[minRole]) reply.code(403).send({ ok: false, error: 'forbidden' });
    };
  });
});

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    role?: Role;
  }
  interface FastifyInstance {
    requireAuth: (req: any, reply: any) => Promise<void>;
    requireRole: (minRole: Role) => (req: any, reply: any) => Promise<void>;
  }
}
