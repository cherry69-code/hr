import type { FastifyInstance } from 'fastify';
import { cacheGetJson, cacheSetJson } from '../../utils/cache';
import { listLeaderboard } from './repository';

const keyPage = (tenantId: string, year: number, month: number, page: number, limit: number) =>
  `leaderboard:${tenantId}:${year}:${month}:p:${page}:l:${limit}`;
const keyTop = (tenantId: string, year: number, month: number, limit: number) => `leaderboard:${tenantId}:${year}:${month}:top:${limit}`;
const zKey = (tenantId: string, year: number, month: number) => `leaderboard:z:${tenantId}:${year}:${month}`;

const addRanks = <T>(items: T[], offset: number) => {
  return items.map((v: any, i) => ({ ...v, rank: offset + i + 1 }));
};

export const getMonthly = async (
  app: FastifyInstance,
  tenantId: string,
  params: { year?: string; month?: string; page: number; limit: number }
) => {
  const now = new Date();
  const year = params.year ? Number(params.year) : now.getUTCFullYear();
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1;
  const page = Math.max(1, params.page);
  const limit = Math.min(200, Math.max(1, params.limit));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false as const, error: 'invalid year/month' };
  }

  const key = keyPage(tenantId, year, month, page, limit);
  const cached = await cacheGetJson<any>(app.redis, key);
  if (cached) return { ok: true as const, data: cached, cached: true, pagination: { page, limit, year, month } };

  const skip = (page - 1) * limit;
  const zk = zKey(tenantId, year, month);
  const card = await app.redis.zcard(zk).catch(() => 0);
  if (card > 0) {
    const end = skip + limit - 1;
    const raw = (await (app.redis as any).zrevrange(zk, skip, end, 'WITHSCORES').catch(() => [])) as string[];
    const pairs: Array<{ employee_id: string; score: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      pairs.push({ employee_id: String(raw[i]), score: Number(raw[i + 1] || 0) });
    }
    const ids = pairs.map((p) => p.employee_id);
    const employees = await app.prismaRead.employees.findMany({
      where: { tenant_id: tenantId, id: { in: ids } } as any,
      select: { id: true, employee_code: true, full_name: true }
    });
    const byId = new Map(employees.map((e: any) => [e.id, e]));
    const out = addRanks(
      pairs
        .map((p) => ({
          employee_id: p.employee_id,
          score: p.score,
          employee: byId.get(p.employee_id) || null
        }))
        .filter((r) => r.employee),
      skip
    );
    await cacheSetJson(app.redis, key, out, 10);
    return { ok: true as const, data: out, cached: false, pagination: { page, limit, year, month } };
  }

  const rows = await listLeaderboard(app.prismaRead, { tenantId, year, month, skip, take: limit });
  await cacheSetJson(app.redis, key, rows, 30);
  return { ok: true as const, data: rows, cached: false, pagination: { page, limit, year, month } };
};

export const getLiveTop = async (app: FastifyInstance, tenantId: string, params: { year?: string; month?: string; limit?: string }) => {
  const now = new Date();
  const year = params.year ? Number(params.year) : now.getUTCFullYear();
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1;
  const limit = Math.min(200, Math.max(1, params.limit ? Number(params.limit) : 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false as const, error: 'invalid year/month' };
  }

  const key = keyTop(tenantId, year, month, limit);
  const cached = await cacheGetJson<any>(app.redis, key);
  if (cached) return { ok: true as const, data: cached, cached: true, meta: { year, month, limit } };

  const zk = zKey(tenantId, year, month);
  const card = await app.redis.zcard(zk).catch(() => 0);
  if (card > 0) {
    const raw = (await (app.redis as any).zrevrange(zk, 0, limit - 1, 'WITHSCORES').catch(() => [])) as string[];
    const pairs: Array<{ employee_id: string; score: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      pairs.push({ employee_id: String(raw[i]), score: Number(raw[i + 1] || 0) });
    }
    const ids = pairs.map((p) => p.employee_id);
    const employees = await app.prismaRead.employees.findMany({
      where: { tenant_id: tenantId, id: { in: ids } } as any,
      select: { id: true, employee_code: true, full_name: true }
    });
    const byId = new Map(employees.map((e: any) => [e.id, e]));
    const rows = addRanks(
      pairs
        .map((p) => ({
          employee_id: p.employee_id,
          score: p.score,
          employee: byId.get(p.employee_id) || null
        }))
        .filter((r) => r.employee),
      0
    );
    const max = await app.prismaRead.leaderboard_stats.aggregate({
      where: { tenant_id: tenantId, year, month } as any,
      _max: { updated_at: true }
    });
    const payload = { rows, updated_at: max._max.updated_at };
    await cacheSetJson(app.redis, key, payload, 10);
    return { ok: true as const, data: payload, cached: false, meta: { year, month, limit } };
  }

  const rows = await listLeaderboard(app.prismaRead, { tenantId, year, month, skip: 0, take: limit });
  const max = await app.prismaRead.leaderboard_stats.aggregate({
    where: { tenant_id: tenantId, year, month } as any,
    _max: { updated_at: true }
  });
  const payload = { rows, updated_at: max._max.updated_at };
  await cacheSetJson(app.redis, key, payload, 10);
  return { ok: true as const, data: payload, cached: false, meta: { year, month, limit } };
};
