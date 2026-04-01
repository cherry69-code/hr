import fp from 'fastify-plugin';

export type SystemMode = 'normal' | 'payroll_lock' | 'maintenance';

export const systemModePlugin = fp(async (app) => {
  const cache = new Map<string, { mode: SystemMode; ts: number }>();

  await app.redisSub.subscribe('system.mode.changed').catch(() => {});
  app.redisSub.on('message', (channel, message) => {
    if (channel !== 'system.mode.changed') return;
    let parsed: any = null;
    try {
      parsed = JSON.parse(String(message || ''));
    } catch {
      return;
    }
    const tenantId = String(parsed?.tenant_id || '').trim();
    const mode = String(parsed?.mode || '').trim();
    if (!tenantId) return;
    if (mode !== 'maintenance' && mode !== 'payroll_lock' && mode !== 'normal') return;
    cache.set(tenantId, { mode: mode as SystemMode, ts: Date.now() });
  });

  const readMode = async (tenantId: string): Promise<SystemMode> => {
    const key = tenantId || 'unknown';
    const now = Date.now();
    const c = cache.get(key);
    if (c && now - c.ts < 1000) return c.mode;
    const raw = await app.redis.get(`system:${tenantId}:mode`);
    const mode = (raw === 'maintenance' || raw === 'payroll_lock' || raw === 'normal' ? raw : 'normal') as SystemMode;
    cache.set(key, { mode, ts: now });
    return mode;
  };

  app.addHook('onRequest', async (req, reply) => {
    const url = String(req.url || '');
    if (url.startsWith('/health')) return;
    if (url.startsWith('/metrics')) return;
    if (url.startsWith('/admin')) return;
    const tenantId = String((req as any).tenantId || '').trim();
    if (!tenantId) return;
    const mode = await readMode(tenantId);
    if (mode === 'maintenance') reply.code(503).send({ ok: false, error: 'maintenance' });
  });
});
