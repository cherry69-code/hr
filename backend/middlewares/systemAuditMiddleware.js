const SystemAuditLog = require('../models/SystemAuditLog');
const { sendAdminAlert } = require('../utils/adminAlerts');

const shouldLog = (req) => {
  const method = String(req.method || '').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (String(req.originalUrl || '').startsWith('/uploads/')) return false;
  return true;
};

const safeBodyKeys = (body) => {
  if (!body || typeof body !== 'object') return [];
  return Object.keys(body).filter((k) => !['password', 'token', 'refreshToken', 'signature', 'signatureData', 'file', 'photoBase64', 'imageBase64'].includes(k));
};

const systemAuditMiddleware = (req, res, next) => {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'test') return next();
  if (!shouldLog(req)) return next();

  const startedAt = Date.now();

  res.on('finish', async () => {
    try {
      const actorId = req.user?._id || undefined;
      const actorRole = req.user?.role || undefined;
      const method = String(req.method || '').toUpperCase();
      const path = String(req.originalUrl || req.url || '');
      const statusCode = Number(res.statusCode || 0);
      const ipAddress = String(req.headers['x-forwarded-for'] || req.ip || '');
      const userAgent = String(req.headers['user-agent'] || '');

      const targetId = req.params && req.params.id ? String(req.params.id) : undefined;
      const action = `${method} ${path.split('?')[0]}`;

      const meta = {
        durationMs: Date.now() - startedAt,
        params: req.params || {},
        query: req.query || {},
        bodyKeys: safeBodyKeys(req.body)
      };

      await SystemAuditLog.create({
        actorId,
        actorRole,
        action,
        method,
        path,
        statusCode,
        ipAddress,
        userAgent,
        targetId,
        meta
      });

      const pathNoQuery = path.split('?')[0];
      const isSuccess = statusCode >= 200 && statusCode < 300;
      const critical =
        (method === 'DELETE' && pathNoQuery.startsWith('/api/employees/')) ||
        (pathNoQuery.startsWith('/api/payroll/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) ||
        (pathNoQuery.startsWith('/api/incentives/payout/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) ||
        (pathNoQuery.startsWith('/api/incentives/calculate-monthly') && method === 'POST') ||
        (pathNoQuery.startsWith('/api/documents/') && method === 'DELETE');

      if (isSuccess && critical) {
        setImmediate(() => {
          const subject = `Admin Alert: ${action}`;
          const text = [
            `Action: ${action}`,
            `Actor: ${actorId || 'unknown'} (${actorRole || 'unknown'})`,
            `Target: ${targetId || 'n/a'}`,
            `IP: ${ipAddress}`,
            `Status: ${statusCode}`,
            `Time: ${new Date().toISOString()}`
          ].join('\n');
          sendAdminAlert({ subject, text, html: `<pre>${text}</pre>` }).catch(() => {});
        });
      }
    } catch {}
  });

  next();
};

module.exports = systemAuditMiddleware;
