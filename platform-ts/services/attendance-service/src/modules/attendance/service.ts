import type { FastifyInstance } from 'fastify';
import { listAttendanceDays } from './repository';

export const summary = async (
  app: FastifyInstance,
  tenantId: string,
  params: { employeeId?: string; from?: string; to?: string; page: number; limit: number }
) => {
  const page = Math.max(1, params.page);
  const limit = Math.min(200, Math.max(1, params.limit));
  const skip = (page - 1) * limit;
  const from = params.from ? new Date(params.from) : undefined;
  const to = params.to ? new Date(params.to) : undefined;
  const data = await listAttendanceDays(app.prismaRead, {
    tenantId,
    employeeId: params.employeeId,
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
    skip,
    take: limit
  });
  return { ok: true as const, data, pagination: { page, limit } };
};
