import type { FastifyInstance } from 'fastify';
import type { SimulationBody } from './schema';
import { simulatePayroll } from './service';

export const registerPayrollSimulationController = (app: FastifyInstance) => {
  app.post<{ Body: SimulationBody }>(
    '/api/admin/payroll/simulate',
    { preHandler: app.requireRole('hr_admin') },
    async (req: any, reply) => {
      const result = await simulatePayroll(app, String(req.tenantId), req.body as any);
      if (!result.ok) return reply.code(400).send(result);
      return result;
    }
  );
};

