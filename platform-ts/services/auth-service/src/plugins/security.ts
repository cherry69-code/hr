import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fp from 'fastify-plugin';

const blockedKey = 'ip:blocklist';

const originAllowlist = () =>
  String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const clientIp = (req: any) => {
  const cf = String(req.headers?.['cf-connecting-ip'] || '').trim();
  if (cf) return cf;
  const xff = String(req.headers?.['x-forwarded-for'] || '').trim();
  if (xff) return xff.split(',')[0].trim();
  const rip = String(req.ip || '').trim();
  return rip;
};

export const securityPlugin = fp(async (app) => {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false
  });

  const allow = originAllowlist();
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, false);
      if (!allow.length) return cb(null, false);
      cb(null, allow.includes(origin));
    },
    credentials: true
  });

  app.addHook('onRequest', async (req: any, reply) => {
    const ip = clientIp(req);
    req.clientIp = ip;
    if (!ip) return;
    const blocked = await app.redis.sismember(blockedKey, ip).catch(() => 0);
    if (Number(blocked) === 1) reply.code(403).send({ ok: false, error: 'ip_blocked' });
  });
});

