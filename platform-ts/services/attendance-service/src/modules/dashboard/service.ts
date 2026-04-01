import type { FastifyInstance } from 'fastify';
import { cacheGetJson, cacheSetJson } from '../../utils/cache';
import { getDailyStats } from './repository';

const keyDaily = (tenantId: string, date: string) => `dashboard:daily:${tenantId}:${date}`;

export const getDaily = async (app: FastifyInstance, tenantId: string, dateStr?: string) => {
  const date = dateStr ? new Date(String(dateStr)) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false as const, error: 'invalid date' };
  const day = date.toISOString().slice(0, 10);
  const key = keyDaily(tenantId, day);

  const cached = await cacheGetJson<any>(app.redis, key);
  if (cached) return { ok: true as const, data: cached, cached: true };

  const row = await getDailyStats(app.prismaRead, { tenantId, date: new Date(day) });
  const payload =
    row || {
      date: new Date(day),
      tenant_id: tenantId,
      total_employees: 0,
      present_count: 0,
      half_day_count: 0,
      absent_count: 0,
      lop_count: 0,
      updated_at: new Date()
    };

  await cacheSetJson(app.redis, key, payload, 30);
  return { ok: true as const, data: payload, cached: false };
};
