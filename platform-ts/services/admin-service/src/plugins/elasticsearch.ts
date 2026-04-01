import fp from 'fastify-plugin';
import { Client } from '@elastic/elasticsearch';

declare module 'fastify' {
  interface FastifyInstance {
    es?: Client;
  }
}

export const elasticsearchPlugin = fp(async (app) => {
  const url = String(process.env.ELASTICSEARCH_URL || '').trim();
  if (!url) return;
  const client = new Client({ node: url });
  app.decorate('es', client);
});

