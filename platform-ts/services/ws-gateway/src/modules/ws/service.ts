import type { FastifyInstance } from 'fastify';

export const subscribeRedisAndBroadcast = async (
  app: FastifyInstance,
  clients: Set<any>,
  channels: string[]
) => {
  await app.redisSub.subscribe(...channels);
  app.redisSub.on('message', (channel, message) => {
    let tenantId: string | null = null;
    let parsedMessage: any = null;
    try {
      parsedMessage = JSON.parse(String(message || ''));
      tenantId = parsedMessage?.tenant_id ? String(parsedMessage.tenant_id) : null;
    } catch {}

    const payload = JSON.stringify({ channel, message: parsedMessage ?? message });
    for (const ws of clients) {
      if (tenantId) {
        const t = String((ws as any).tenantId || '');
        if (t !== tenantId) continue;
      }
      try {
        ws.send(payload);
      } catch {}
    }
  });
};
