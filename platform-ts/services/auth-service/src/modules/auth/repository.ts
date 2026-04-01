import type { PrismaClient } from '@prisma/client';

export const findTenantBySlug = (prisma: PrismaClient, slug: string) =>
  prisma.tenants.findUnique({ where: { slug } });

export const createTenant = (prisma: PrismaClient, data: { name: string; slug: string }) =>
  prisma.tenants.create({ data });

export const findUserByEmail = (prisma: PrismaClient, args: { tenant_id: string; email: string }) =>
  prisma.auth_users.findUnique({ where: { tenant_id_email: { tenant_id: args.tenant_id, email: args.email } } });

export const createUser = (prisma: PrismaClient, data: { tenant_id: string; email: string; password_hash: string; role: string }) =>
  prisma.auth_users.create({ data });
