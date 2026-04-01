import type { PrismaClient } from '@prisma/client';

export const listEventLogs = async (
  prisma: PrismaClient,
  args: {
    tenantId: string;
    service?: string;
    type?: string;
    before: Date;
    take: number;
  }
) => {
  return prisma.event_logs.findMany({
    where: {
      tenant_id: args.tenantId,
      ...(args.service ? { service: args.service } : {}),
      ...(args.type ? { type: args.type } : {}),
      created_at: { lt: args.before }
    } as any,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: args.take
  });
};
