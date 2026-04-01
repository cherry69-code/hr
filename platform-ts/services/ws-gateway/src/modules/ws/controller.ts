import type { FastifyInstance } from 'fastify';
import type { LiveQuery } from './schema';

export const registerWsController = (app: FastifyInstance, clients: Set<any>) => {
  app.get<{ Querystring: LiveQuery }>('/live', { websocket: true }, (conn, req) => {
    const token = String((req.query as any)?.token || '').trim();
    if (!token) {
      conn.socket.close();
      return;
    }
    try {
      const payload = app.verifyToken(token);
      (conn.socket as any).tenantId = payload.tenant_id;
    } catch {
      conn.socket.close();
      return;
    }

    clients.add(conn.socket);
    conn.socket.on('close', () => clients.delete(conn.socket));
    conn.socket.on('message', (data: any) => {
      const text = String(data || '').slice(0, 2000);
      if (text === 'ping') conn.socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
    });
  });
};
