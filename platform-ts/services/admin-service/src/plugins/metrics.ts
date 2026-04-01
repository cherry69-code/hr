import fp from 'fastify-plugin';

type Snapshot = {
  startedAt: number;
  durationsMs: number[];
  errors5xx: number;
};

declare module 'fastify' {
  interface FastifyInstance {
    metrics: Snapshot;
  }
}

export const metricsPlugin = fp(async (app) => {
  const metrics: Snapshot = { startedAt: Date.now(), durationsMs: [], errors5xx: 0 };
  app.decorate('metrics', metrics);

  app.addHook('onRequest', async (req) => {
    (req as any).__t0 = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const t0 = Number((req as any).__t0 || 0);
    const dt = t0 ? Date.now() - t0 : 0;
    if (dt > 0) {
      metrics.durationsMs.push(dt);
      if (metrics.durationsMs.length > 2000) metrics.durationsMs.splice(0, metrics.durationsMs.length - 2000);
    }
    if (reply.statusCode >= 500) metrics.errors5xx += 1;
  });
});

