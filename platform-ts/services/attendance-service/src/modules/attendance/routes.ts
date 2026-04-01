import type { FastifyInstance } from 'fastify';
import { registerAttendanceController } from './controller';

export const registerAttendanceRoutes = async (app: FastifyInstance) => {
  registerAttendanceController(app);
};

