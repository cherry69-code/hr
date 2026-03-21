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

const ensureConfig = (cfg) => {
  if (!cfg.host || !cfg.database || !cfg.user || !cfg.password) {
    throw new Error('ETIME DB env vars are not fully configured');
  }
};

const getMssqlPool = async (override) => {
  if (mssqlPool) return mssqlPool;
  const cfg = getConfig(override);
  ensureConfig(cfg);
  const pool = await mssql.connect({
    server: cfg.host,
    port: cfg.port || 1433,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    options: { encrypt: true, trustServerCertificate: true },
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

exports.fetchCheckinOutSince = async (sinceTime, overrideConfig) => {
  const driver = getDriver(overrideConfig);
  const since = sinceTime instanceof Date ? sinceTime : new Date(String(sinceTime || ''));
  if (Number.isNaN(since.getTime())) {
    throw new Error('Invalid lastSyncedTime');
  }

  if (driver === 'mysql') {
    const pool = await getMysqlPool(overrideConfig);
    const [rows] = await pool.query(
      'SELECT USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID FROM CHECKINOUT WHERE CHECKTIME > ? ORDER BY CHECKTIME ASC',
      [since]
    );
    return rows || [];
  }

  const pool = await getMssqlPool(overrideConfig);
  const req = pool.request();
  req.input('since', mssql.DateTime2, since);
  const result = await req.query(
    'SELECT USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID FROM CHECKINOUT WHERE CHECKTIME > @since ORDER BY CHECKTIME ASC'
  );
  return result.recordset || [];
};
