import type { PrismaClient } from '@prisma/client';

export const listAuditLogs = (
  prisma: PrismaClient,
  args: {
    tenantId: string;
    actor_user_id?: string;
    actor_email?: string;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    before: Date;
    take: number;
  }
) =>
  prisma.audit_logs.findMany({
    where: {
      tenant_id: args.tenantId,
      ...(args.actor_user_id ? { actor_user_id: args.actor_user_id } : {}),
      ...(args.actor_email ? { actor_email: args.actor_email } : {}),
      ...(args.action ? { action: args.action } : {}),
      ...(args.entity_type ? { entity_type: args.entity_type } : {}),
      ...(args.entity_id ? { entity_id: args.entity_id } : {}),
      created_at: { lt: args.before }
    } as any,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: args.take
  });
