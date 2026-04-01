import type { PrismaClient } from '@prisma/client';

export const getDailyStats = (prisma: PrismaClient, args: { tenantId: string; date: Date }) =>
  prisma.dashboard_daily_stats.findUnique({ where: { tenant_id_date: { tenant_id: args.tenantId, date: args.date } } as any });
