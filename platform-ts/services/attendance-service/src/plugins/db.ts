import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    prismaRead: PrismaClient;
  }
}

export const dbPlugin = fp(async (app) => {
  const writeUrl = String(process.env.DATABASE_URL || '');
  const readUrl = String(process.env.READ_DATABASE_URL || writeUrl);
  const prisma = new PrismaClient(writeUrl ? { datasources: { db: { url: writeUrl } } } : undefined);
  const prismaRead = new PrismaClient(readUrl ? { datasources: { db: { url: readUrl } } } : undefined);
  await prisma.$connect();
  await prismaRead.$connect();
  app.decorate('prisma', prisma);
  app.decorate('prismaRead', prismaRead);
  app.addHook('onClose', async () => {
    await prismaRead.$disconnect();
    await prisma.$disconnect();
  });
});
