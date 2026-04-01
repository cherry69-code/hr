import fp from 'fastify-plugin';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(async (app) => {
  const url = String(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  const client = new Redis(url, { maxRetriesPerRequest: null });
  app.decorate('redis', client);
  app.addHook('onClose', async () => {
    await client.quit();
  });
});

