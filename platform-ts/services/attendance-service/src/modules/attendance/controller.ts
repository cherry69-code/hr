import type { FastifyInstance } from 'fastify';
import { summary } from './service';

export const registerAttendanceController = (app: FastifyInstance) => {
  app.get('/days', { preHandler: app.requireAuth }, async (req: any) => {
    const page = req.query?.page ? Number(req.query.page) : 1;
    const limit = req.query?.limit ? Number(req.query.limit) : 50;
    const employeeId = req.query?.employee_id ? String(req.query.employee_id) : undefined;
    const from = req.query?.from ? String(req.query.from) : undefined;
    const to = req.query?.to ? String(req.query.to) : undefined;
    return summary(app, String(req.tenantId), { page, limit, employeeId, from, to });
  });
};
