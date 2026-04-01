import type { FastifyInstance } from 'fastify';
import type { IncentiveBody, PayslipQuery, RecalculateBody, SimulationBody } from './schema';
import { enqueueIncentiveCalc, enqueueRecalc, fetchPayslip, getIncentiveResult, simulatePayroll } from './service';

export const registerPayrollController = (app: FastifyInstance) => {
  app.get<{ Querystring: PayslipQuery }>('/payslips/:employeeId', { preHandler: app.requireAuth }, async (req: any, reply) => {
    const employeeId = String(req.params?.employeeId || '').trim();
    const result = await fetchPayslip(app, { tenantId: String(req.tenantId), employeeId, year: (req.query as any)?.year, month: (req.query as any)?.month });
    if (!result.ok) return reply.code(result.error === 'not found' ? 404 : 400).send(result);
    return result;
  });

  app.post<{ Body: SimulationBody }>('/simulate', { preHandler: app.requireRole('hr_admin') }, async (req, reply) => {
    const result = await simulatePayroll(app, String((req as any).tenantId), req.body as any);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.post<{ Body: RecalculateBody }>('/recalculate', { preHandler: app.requireAuth }, async (req, reply) => {
    const result = await enqueueRecalc(app, String((req as any).tenantId), req.body);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  app.post<{ Body: IncentiveBody }>('/incentives/calculate', { preHandler: app.requireAuth }, async (req) => {
    const revenue = Number(req.body?.revenue || 0);
    return enqueueIncentiveCalc(app, String((req as any).tenantId), revenue);
  });

  app.get('/incentives/:jobId', { preHandler: app.requireAuth }, async (req: any, reply) => {
    const result = await getIncentiveResult(app, String(req.tenantId), String(req.params?.jobId || ''));
    if (!result.ok) return reply.code(result.error === 'not_ready' ? 202 : 400).send(result);
    return result;
  });
};
