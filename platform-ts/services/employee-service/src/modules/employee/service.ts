import type { FastifyInstance } from 'fastify';
import { cacheDel, cacheGetJson, cacheSetJson } from '../../utils/cache';
import { createEmployee, deleteEmployee, getEmployeeById, listEmployees, updateEmployee } from './repository';

const keyById = (id: string) => `emp:profile:${id}`;
const audit = async (
  app: FastifyInstance,
  tenantId: string,
  actor: { userId?: string; email?: string } | undefined,
  action: string,
  entity: { type: string; id?: string; meta?: any }
) => {
  await app.prisma.audit_logs
    .create({
      data: {
        tenant_id: tenantId,
        actor_user_id: actor?.userId ? String(actor.userId) : null,
        actor_email: actor?.email ? String(actor.email) : null,
        action,
        entity_type: entity.type,
        entity_id: entity.id ? String(entity.id) : null,
        meta: entity.meta ?? {}
      }
    } as any)
    .catch(() => {});
};

export const list = async (app: FastifyInstance, tenantId: string, params: { q?: string; page: number; limit: number }) => {
  const page = Math.max(1, params.page);
  const limit = Math.min(200, Math.max(1, params.limit));
  const skip = (page - 1) * limit;
  const data = await listEmployees(app.prismaRead, { tenantId, q: params.q, skip, take: limit });
  return { ok: true as const, data, pagination: { page, limit } };
};

export const getById = async (app: FastifyInstance, tenantId: string, id: string) => {
  const cached = await cacheGetJson<any>(app.redis, keyById(id));
  if (cached) return { ok: true as const, data: cached, cached: true };
  const emp = await getEmployeeById(app.prismaRead, { tenantId, id });
  if (!emp) return { ok: false as const, error: 'not found' };
  await cacheSetJson(app.redis, keyById(id), emp, 600);
  return { ok: true as const, data: emp, cached: false };
};

export const create = async (app: FastifyInstance, tenantId: string, body: any, actor?: { userId?: string; email?: string }) => {
  const joining_date = body.joining_date ? new Date(String(body.joining_date)) : undefined;
  const data = {
    tenant_id: tenantId,
    employee_code: String(body.employee_code || '').trim(),
    full_name: String(body.full_name || '').trim(),
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    department_id: body.department_id ? String(body.department_id) : null,
    team_id: body.team_id ? String(body.team_id) : null,
    manager_id: body.manager_id ? String(body.manager_id) : null,
    level: body.level ? String(body.level) : 'n0',
    joining_date: joining_date && !Number.isNaN(joining_date.getTime()) ? joining_date : null
  };
  if (!data.employee_code || !data.full_name) return { ok: false as const, error: 'employee_code and full_name required' };
  const created = await createEmployee(app.prisma, data);
  await audit(app, tenantId, actor, 'employee.created', { type: 'employee', id: created.id, meta: { employee_code: created.employee_code } });
  return { ok: true as const, data: created };
};

export const update = async (app: FastifyInstance, tenantId: string, id: string, body: any, actor?: { userId?: string; email?: string }) => {
  const joining_date = body.joining_date ? new Date(String(body.joining_date)) : undefined;
  const data: any = {};
  if (body.employee_code !== undefined) data.employee_code = String(body.employee_code || '').trim();
  if (body.full_name !== undefined) data.full_name = String(body.full_name || '').trim();
  if (body.email !== undefined) data.email = body.email ? String(body.email).trim() : null;
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null;
  if (body.department_id !== undefined) data.department_id = body.department_id ? String(body.department_id) : null;
  if (body.team_id !== undefined) data.team_id = body.team_id ? String(body.team_id) : null;
  if (body.manager_id !== undefined) data.manager_id = body.manager_id ? String(body.manager_id) : null;
  if (body.level !== undefined) data.level = body.level ? String(body.level) : 'n0';
  if (body.joining_date !== undefined) data.joining_date = joining_date && !Number.isNaN(joining_date.getTime()) ? joining_date : null;
  const res = await updateEmployee(app.prisma, { tenantId, id, data });
  if (!res.count) return { ok: false as const, error: 'not found' };
  const updated = await getEmployeeById(app.prismaRead, { tenantId, id });
  if (!updated) return { ok: false as const, error: 'not found' };
  await cacheDel(app.redis, keyById(id));
  await app.redis.publish('cache.invalidate', JSON.stringify({ keys: [keyById(id)], tags: [`http:employees:${tenantId}`, `http:admin:${tenantId}`] })).catch(() => {});
  await audit(app, tenantId, actor, 'employee.updated', { type: 'employee', id, meta: { fields: Object.keys(data) } });
  return { ok: true as const, data: updated };
};

export const remove = async (app: FastifyInstance, tenantId: string, id: string, actor?: { userId?: string; email?: string }) => {
  const res = await deleteEmployee(app.prisma, { tenantId, id });
  if (!res.count) return { ok: false as const, error: 'not found' };
  await cacheDel(app.redis, keyById(id));
  await app.redis.publish('cache.invalidate', JSON.stringify({ keys: [keyById(id)], tags: [`http:employees:${tenantId}`, `http:admin:${tenantId}`] })).catch(() => {});
  await audit(app, tenantId, actor, 'employee.deleted', { type: 'employee', id });
  return { ok: true as const };
};
