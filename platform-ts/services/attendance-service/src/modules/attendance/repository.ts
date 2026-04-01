import type { PrismaClient } from '@prisma/client';

export const listAttendanceDays = (
  prisma: PrismaClient,
  args: { tenantId: string; employeeId?: string; from?: Date; to?: Date; skip: number; take: number }
) =>
  prisma.attendance_days.findMany({
    where: {
      tenant_id: args.tenantId,
      ...(args.employeeId ? { employee_id: args.employeeId } : {}),
      ...(args.from || args.to
        ? {
            date: {
              ...(args.from ? { gte: args.from } : {}),
              ...(args.to ? { lte: args.to } : {})
            }
          }
        : {})
    } as any,
    orderBy: { date: 'desc' },
    skip: args.skip,
    take: args.take
  });
