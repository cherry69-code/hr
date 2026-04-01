import type { PrismaClient } from '@prisma/client';

export const listEmployees = (prisma: PrismaClient, args: { tenantId: string; q?: string; skip: number; take: number }) => {
  const where = args.q
    ? {
        tenant_id: args.tenantId,
        OR: [
          { full_name: { contains: args.q, mode: 'insensitive' as const } },
          { employee_code: { contains: args.q, mode: 'insensitive' as const } }
        ]
      }
    : { tenant_id: args.tenantId };
  return prisma.employees.findMany({
    where: where as any,
    orderBy: { created_at: 'desc' },
    skip: args.skip,
    take: args.take,
    select: {
      id: true,
      employee_code: true,
      full_name: true,
      email: true,
      phone: true,
      status: true,
      level: true,
      department_id: true,
      team_id: true,
      manager_id: true,
      joining_date: true
    }
  });
};

export const getEmployeeById = (prisma: PrismaClient, args: { tenantId: string; id: string }) =>
  prisma.employees.findFirst({
    where: { id: args.id, tenant_id: args.tenantId } as any,
    select: {
      id: true,
      employee_code: true,
      full_name: true,
      email: true,
      phone: true,
      status: true,
      level: true,
      department_id: true,
      team_id: true,
      manager_id: true,
      joining_date: true
    }
  });

export const createEmployee = (prisma: PrismaClient, data: any) => prisma.employees.create({ data });

export const updateEmployee = (prisma: PrismaClient, args: { tenantId: string; id: string; data: any }) =>
  prisma.employees.updateMany({ where: { id: args.id, tenant_id: args.tenantId } as any, data: args.data });

export const deleteEmployee = (prisma: PrismaClient, args: { tenantId: string; id: string }) =>
  prisma.employees.deleteMany({ where: { id: args.id, tenant_id: args.tenantId } as any });
