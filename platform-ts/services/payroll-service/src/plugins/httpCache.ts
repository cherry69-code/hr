import fp from 'fastify-plugin';
import { cacheTagAdd } from '../utils/cache';

const ttlFor = (url: string) => {
  if (url.startsWith('/health')) return 0;
  if (url.startsWith('/metrics')) return 0;
  if (url.startsWith('/admin')) return 0;
  if (url.startsWith('/payslips')) return 30;
  return url.startsWith('/incentives') ? 30 : 10;
};

export const httpCachePlugin = fp(async (app) => {
  app.addHook('onRequest', async (req: any, reply) => {
    if (req.method !== 'GET') return;
    const url = String(req.url || '');
    const ttl = ttlFor(url);
    if (!ttl) return;
    const tenantId = String(req.tenantId || '').trim();
    if (!tenantId) return;
    const role = String(req.role || 'unknown');
    const key = `http:payroll:${tenantId}:${role}:${url}`;
    const cached = await app.redis.get(key);
    if (!cached) return;
    reply.header('x-cache', 'hit');
    reply.type('application/json').send(cached);
  });

  app.addHook('onSend', async (req: any, reply, payload) => {
    if (req.method !== 'GET') return payload;
    if (reply.statusCode !== 200) return payload;
    const url = String(req.url || '');
    const ttl = ttlFor(url);
    if (!ttl) return payload;
    const ct = String(reply.getHeader('content-type') || '');
    if (!ct.includes('application/json')) return payload;
    const tenantId = String(req.tenantId || '').trim();
    if (!tenantId) return payload;
    const role = String(req.role || 'unknown');
    const key = `http:payroll:${tenantId}:${role}:${url}`;
    if (typeof payload === 'string' && payload.length <= 500000) {
      await app.redis.set(key, payload, 'EX', ttl);
      await cacheTagAdd(app.redis, key, [`http:payroll:${tenantId}`, `http:payroll:${tenantId}:${role}`], ttl);
    }
    return payload;
  });
});
