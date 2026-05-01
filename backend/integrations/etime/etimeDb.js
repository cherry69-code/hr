const mssql = require('mssql');
const mysql = require('mysql2/promise');

let mssqlPool = null;
let mysqlPool = null;

const getDriver = (override) => String(override?.driver || process.env.ETIME_DB_DRIVER || 'mssql').toLowerCase();

const getConfig = (override) => {
  const host = String(override?.host || process.env.ETIME_DB_HOST || '').trim();
  const portRaw = override?.port !== undefined ? override.port : process.env.ETIME_DB_PORT;
  const port = portRaw ? Number(portRaw) : undefined;
  const database = String(override?.database || process.env.ETIME_DB_NAME || '').trim();
  const user = String(override?.user || process.env.ETIME_DB_USER || '').trim();
  const password = String(override?.password || process.env.ETIME_DB_PASSWORD || '');
  return { host, port, database, user, password };
};

const normalizeSqlServerHost = (hostRaw) => {
  const raw = String(hostRaw || '').trim();
  if (!raw) return { server: '', instanceName: undefined };

  const normalized = raw === '.' ? 'localhost' : raw.replace(/^\.\//, 'localhost/').replace(/^\.\\/, 'localhost\\');
  const parts = normalized.split('\\');
  const server = String(parts[0] || '').trim() || 'localhost';
  const instanceName = parts.length > 1 ? String(parts.slice(1).join('\\') || '').trim() : undefined;
  return { server, instanceName: instanceName || undefined };
};

const ensureConfig = (cfg) => {
  if (!cfg.host || !cfg.database || !cfg.user || !cfg.password) {
    throw new Error('ETIME DB env vars are not fully configured');
  }
};

const getMssqlPool = async (override) => {
  if (mssqlPool) return mssqlPool;
  const cfg = getConfig(override);
  ensureConfig(cfg);
  const { server, instanceName } = normalizeSqlServerHost(cfg.host);
  const pool = await mssql.connect({
    server,
    port: instanceName ? undefined : (cfg.port || 1433),
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      instanceName
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
  });
  mssqlPool = pool;
  return mssqlPool;
};

const getMysqlPool = async (override) => {
  if (mysqlPool) return mysqlPool;
  const cfg = getConfig(override);
  ensureConfig(cfg);
  mysqlPool = mysql.createPool({
    host: cfg.host,
    port: cfg.port || 3306,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    waitForConnections: true,
    connectionLimit: 5
  });
  return mysqlPool;
};

exports.fetchDeviceLogsSince = async (sinceTime, overrideConfig) => {
  const driver = getDriver(overrideConfig);
  const since = sinceTime instanceof Date ? sinceTime : new Date(String(sinceTime || ''));
  if (Number.isNaN(since.getTime())) {
    throw new Error('Invalid lastSyncedTime');
  }

  if (driver === 'mysql') {
    const pool = await getMysqlPool(overrideConfig);
    const [rows] = await pool.query(
      'SELECT UserId, LogDate, DeviceId FROM DeviceLogs WHERE LogDate > ? ORDER BY LogDate ASC',
      [since]
    );
    return rows || [];
  }

  const pool = await getMssqlPool(overrideConfig);
  const req = pool.request();
  req.input('since', mssql.DateTime2, since);
  const result = await req.query(
    'SELECT UserId, LogDate, DeviceId FROM DeviceLogs WHERE LogDate > @since ORDER BY LogDate ASC'
  );
  return result.recordset || [];
};

// Backward-compatible export name used by older controller/service code.
exports.fetchCheckinOutSince = exports.fetchDeviceLogsSince;
