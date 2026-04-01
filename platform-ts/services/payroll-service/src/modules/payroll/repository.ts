import type { PrismaClient } from '@prisma/client';

export const getPayslip = (prisma: PrismaClient, args: { tenantId: string; employeeId: string; year: number; month: number }) =>
  prisma.payslips.findUnique({
    where: { tenant_id_employee_id_year_month: { tenant_id: args.tenantId, employee_id: args.employeeId, year: args.year, month: args.month } } as any
  });
