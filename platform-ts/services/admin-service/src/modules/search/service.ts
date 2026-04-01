import type { FastifyInstance } from 'fastify';

const idx = (tenantId: string, name: string) => `${name}-${tenantId}`;

export const health = async (app: FastifyInstance) => {
  if (!app.es) return { ok: false as const, error: 'elasticsearch_not_configured' };
  const res = await app.es.cluster.health();
  return { ok: true as const, data: res };
};

export const reindex = async (
  app: FastifyInstance,
  tenantId: string,
  args: { index: 'employees' | 'event_logs' | 'audit_logs'; limit?: number }
) => {
  if (!app.es) return { ok: false as const, error: 'elasticsearch_not_configured' };
  const limit = Math.min(50000, Math.max(1, args.limit ? Number(args.limit) : 10000));

  const indexName =
    args.index === 'employees'
      ? idx(tenantId, 'employees')
      : args.index === 'event_logs'
        ? idx(tenantId, 'event_logs')
        : idx(tenantId, 'audit_logs');

  await app.es.indices.create({ index: indexName }, { ignore: [400] });

  const take = 1000;
  let done = 0;
  let cursorId: string | null = null;

  const push = async (docs: Array<{ id: string; body: any }>) => {
    const ops: any[] = [];
    for (const d of docs) {
      ops.push({ index: { _index: indexName, _id: d.id } });
      ops.push(d.body);
    }
    if (ops.length) await app.es!.bulk({ refresh: true, operations: ops });
  };

  while (done < limit) {
    if (args.index === 'employees') {
      const rows: any[] = await app.prismaRead.employees.findMany({
        where: { tenant_id: tenantId } as any,
        orderBy: { created_at: 'desc' },
        take,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: { id: true, employee_code: true, full_name: true, email: true, phone: true, status: true, level: true, created_at: true, updated_at: true }
      });
      if (!rows.length) break;
      await push(rows.map((r: any) => ({ id: r.id, body: { ...r, tenant_id: tenantId } })));
      done += rows.length;
      cursorId = rows[rows.length - 1].id;
      continue;
    }

    if (args.index === 'event_logs') {
      const rows: any[] = await app.prismaRead.event_logs.findMany({
        where: { tenant_id: tenantId } as any,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: { id: true, service: true, type: true, payload: true, created_at: true }
      });
      if (!rows.length) break;
      await push(rows.map((r: any) => ({ id: r.id, body: { ...r, tenant_id: tenantId } })));
      done += rows.length;
      cursorId = rows[rows.length - 1].id;
      continue;
    }

    const rows: any[] = await app.prismaRead.audit_logs.findMany({
      where: { tenant_id: tenantId } as any,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true, actor_user_id: true, actor_email: true, action: true, entity_type: true, entity_id: true, meta: true, created_at: true }
    });
    if (!rows.length) break;
    await push(rows.map((r: any) => ({ id: r.id, body: { ...r, tenant_id: tenantId } })));
    done += rows.length;
    cursorId = rows[rows.length - 1].id;
  }

  await app.prisma.event_logs
    .create({ data: { tenant_id: tenantId, service: 'admin-service', type: 'search.reindex', payload: { index: args.index, count: done } } } as any)
    .catch(() => {});

  return { ok: true as const, data: { index: args.index, index_name: indexName, indexed: done } };
};
