import type { FastifyInstance } from 'fastify';
import type { BiometricLogBody } from './schema';
import { getLogs, ingest } from './service';

export const registerBiometricController = (app: FastifyInstance) => {
  app.post<{ Body: BiometricLogBody }>('/biometric/logs', async (req: any, reply) => {
    const token =
      String(req.headers['x-biometric-token'] || '').trim() ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const result = await ingest(app, req.body, token);
    if (!result.ok) return reply.code(403).send(result);
    return result;
  });

  app.get('/biometric/logs', { preHandler: app.requireAuth }, async (req: any) => {
    const page = req.query?.page ? Number(req.query.page) : 1;
    const limit = req.query?.limit ? Number(req.query.limit) : 50;
    const employeeCode = req.query?.employee_code ? String(req.query.employee_code) : undefined;
    const deviceId = req.query?.device_id ? String(req.query.device_id) : undefined;
    return getLogs(app, String(req.tenantId), { page, limit, employeeCode, deviceId });
  });
};
