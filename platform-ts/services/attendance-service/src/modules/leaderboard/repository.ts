import type { PrismaClient } from '@prisma/client';

export const listLeaderboard = (prisma: PrismaClient, args: { tenantId: string; year: number; month: number; skip: number; take: number }) =>
  prisma.leaderboard_stats.findMany({
    where: { tenant_id: args.tenantId, year: args.year, month: args.month } as any,
    orderBy: [{ rank: 'asc' }],
    skip: args.skip,
    take: args.take,
    include: { employee: { select: { employee_code: true, full_name: true } } }
  });
