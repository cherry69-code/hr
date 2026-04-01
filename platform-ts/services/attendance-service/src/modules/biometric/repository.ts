import type { PrismaClient } from '@prisma/client';

export const getDeviceById = (prisma: PrismaClient, deviceId: string) =>
  prisma.biometric_devices.findUnique({ where: { device_id: deviceId } });

export const insertLog = (prisma: PrismaClient, data: any) =>
  prisma.biometric_logs.createMany({ data: [data], skipDuplicates: true });

export const listLogs = (prisma: PrismaClient, args: { tenantId: string; employeeCode?: string; deviceId?: string; skip: number; take: number }) =>
  prisma.biometric_logs.findMany({
    where: {
      tenant_id: args.tenantId,
      ...(args.employeeCode ? { employee_code: args.employeeCode } : {}),
      ...(args.deviceId ? { device_id: args.deviceId } : {})
    } as any,
    orderBy: { punch_time: 'desc' },
    skip: args.skip,
    take: args.take
  });
