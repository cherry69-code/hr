const mssql = require('mssql');
const mysql = require('mysql2/promise');

let mssqlPool = null;
let mysqlPool = null;
let odbcModule = null;

const getOdbc = () => {
  if (odbcModule) return odbcModule;
  // Load ODBC only when Access sync is actually used. Linux hosts like Render
  // don't have the Windows MDB driver/runtime, so startup must not require it.
  // eslint-disable-next-line global-require
  odbcModule = require('odbc');
  return odbcModule;
};

const getDriver = (override) => String(override?.driver || process.env.ETIME_DB_DRIVER || 'mssql').toLowerCase();

const getConfig = (override) => {
  const host = String(override?.host || process.env.ETIME_DB_HOST || '').trim();
  const portRaw = override?.port !== undefined ? override.port : process.env.ETIME_DB_PORT;
  const port = portRaw ? Number(portRaw) : undefined;
  const database = String(override?.database || process.env.ETIME_DB_NAME || '').trim();
  const user = String(override?.user || process.env.ETIME_DB_USER || '').trim();
  const password = String(override?.password || process.env.ETIME_DB_PASSWORD || '');
  const pathFromInput = override?.filePath !== undefined ? override.filePath : process.env.ETIME_DB_PATH;
  const filePath = String(pathFromInput || '').trim() || (/\.(mdb|accdb)$/i.test(host) ? host : '');
  return { host, port, database, user, password, filePath };
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

const ensureConfig = (driver, cfg) => {
  if (driver === 'access') {
    if (!cfg.filePath) {
      throw new Error('ETIME Access DB path is not configured');
    }
    return;
  }

  if (!cfg.host || !cfg.database || !cfg.user) {
    throw new Error('ETIME DB connection is not fully configured');
  }
};

const getMssqlPool = async (override) => {
  if (mssqlPool) return mssqlPool;
  const cfg = getConfig(override);
  ensureConfig('mssql', cfg);
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
  ensureConfig('mysql', cfg);
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

const buildAccessConnectionString = (cfg) => {
  const path = String(cfg.filePath || '').trim();
  const user = String(cfg.user || 'Admin').trim() || 'Admin';
  const password = String(cfg.password || '');
  return [
    'Driver={Microsoft Access Driver (*.mdb, *.accdb)}',
    `Dbq=${path}`,
    `Uid=${user}`,
    `Pwd=${password}`
  ].join(';') + ';';
};

const runAccessQuery = async (cfg, sql) => {
  const odbc = getOdbc();
  const conn = await odbc.connect(buildAccessConnectionString(cfg));
  try {
    const rows = await conn.query(sql);
    return Array.isArray(rows) ? rows : [];
  } finally {
    await conn.close().catch(() => null);
  }
};

const toAccessDateLiteral = (value) => {
  const dt = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(dt.getTime())) {
    throw new Error('Invalid Access date value');
  }
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `#${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}#`;
};

const normalizeKey = (value) => String(value ?? '').trim().toLowerCase();

const buildAccessEmployeeResolver = async (cfg) => {
  const employees = await runAccessQuery(
    cfg,
    `
      SELECT
        [EmployeeId],
        [EmployeeCode],
        [EmployeeCodeInDevice],
        [NumericCode],
        [StringCode]
      FROM [Employees]
    `
  ).catch(() => []);

  const lookup = new Map();
  for (const row of employees) {
    const preferredCode = String(row.EmployeeCodeInDevice || row.EmployeeCode || row.StringCode || row.NumericCode || row.EmployeeId || '').trim();
    if (!preferredCode) continue;
    const keys = [
      row.EmployeeId,
      row.EmployeeCode,
      row.EmployeeCodeInDevice,
      row.NumericCode,
      row.StringCode
    ];
    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (normalized && !lookup.has(normalized)) {
        lookup.set(normalized, preferredCode);
      }
    }
  }

  return (rawId) => {
    const normalized = normalizeKey(rawId);
    if (!normalized) return '';
    return lookup.get(normalized) || String(rawId).trim();
  };
};

const toAccessDate = (raw) => {
  const dt = raw instanceof Date ? raw : new Date(String(raw || ''));
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const parseTimeLike = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return null;
  const full = new Date(text);
  if (!Number.isNaN(full.getTime())) return full;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const meridiem = String(match[4] || '').toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) return null;
  return { hours, minutes, seconds };
};

const combineAccessDateAndTime = (baseDateRaw, timeRaw) => {
  const baseDate = toAccessDate(baseDateRaw);
  if (!baseDate) return null;
  const timeOnly = parseTimeLike(timeRaw);
  if (timeOnly && !(timeOnly instanceof Date)) {
    const combined = new Date(baseDate);
    combined.setHours(timeOnly.hours, timeOnly.minutes, timeOnly.seconds, 0);
    return combined;
  }
  return timeOnly instanceof Date ? timeOnly : baseDate;
};

const dedupePunchRows = (rows) => {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const employeeCode = String(row?.UserId || '').trim();
    const logDate = toAccessDate(row?.LogDate);
    if (!employeeCode || !logDate) return false;
    const key = `${employeeCode}|${logDate.toISOString()}|${String(row?.CHECKTYPE || 'I').trim().toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    row.LogDate = logDate;
    return true;
  });
};

const fetchAccessDeviceLogsSince = async (sinceTime, override) => {
  const cfg = getConfig(override);
  ensureConfig('access', cfg);
  const since = toAccessDateLiteral(sinceTime);
  const resolveEmployeeCode = await buildAccessEmployeeResolver(cfg);

  const deviceLogSql = `
    SELECT
      [UserId],
      [LogDate] AS LogDate,
      [DeviceId],
      [Direction]
    FROM [DeviceLogs]
    WHERE [LogDate] > ${since}
    ORDER BY [LogDate] ASC
  `;

  const deviceLogRows = await runAccessQuery(cfg, deviceLogSql)
    .catch(() => [])
    .then((rows) =>
      rows.map((row) => ({
        UserId: resolveEmployeeCode(row.UserId),
        LogDate: toAccessDate(row.LogDate),
        DeviceId: row.DeviceId,
        CHECKTYPE: String(row.Direction || '').trim().toUpperCase() === 'OUT' ? 'O' : 'I',
        VERIFYCODE: null
      }))
    );

  const attendanceInSql = `
    SELECT
      [AttendanceDate],
      [EmployeeId],
      [InTime],
      [InDeviceId]
    FROM [AttendanceLogs]
    WHERE [InTime] IS NOT NULL AND [AttendanceDate] >= ${since}
    ORDER BY [AttendanceDate] ASC
  `;

  const attendanceOutSql = `
    SELECT
      [AttendanceDate],
      [EmployeeId],
      [OutTime],
      [OutDeviceId]
    FROM [AttendanceLogs]
    WHERE [OutTime] IS NOT NULL AND [AttendanceDate] >= ${since}
    ORDER BY [AttendanceDate] ASC
  `;

  const inRows = await runAccessQuery(cfg, attendanceInSql).catch(() => []);
  const outRows = await runAccessQuery(cfg, attendanceOutSql).catch(() => []);

  const attendanceRows = [...inRows, ...outRows].map((row) => ({
    UserId: resolveEmployeeCode(row.EmployeeId),
    LogDate: combineAccessDateAndTime(row.AttendanceDate, row.InTime || row.OutTime),
    DeviceId: row.InDeviceId || row.OutDeviceId || '',
    CHECKTYPE: row.InTime ? 'I' : 'O',
    VERIFYCODE: null
  }));

  const punchTimeSql = `
    SELECT
      [tktno],
      [date],
      [INOUT]
    FROM [PunchTimeDetails]
    WHERE [date] > ${since}
    ORDER BY [date] ASC
  `;

  const punchTimeRows = await runAccessQuery(cfg, punchTimeSql)
    .catch(() => [])
    .then((rows) =>
      rows.map((row) => ({
        UserId: resolveEmployeeCode(row.tktno),
        LogDate: toAccessDate(row.date),
        DeviceId: '',
        CHECKTYPE: String(row.INOUT || '').trim().toUpperCase() === 'OUT' ? 'O' : 'I',
        VERIFYCODE: null
      }))
    );

  return dedupePunchRows([...deviceLogRows, ...attendanceRows, ...punchTimeRows]).sort(
    (a, b) => new Date(a.LogDate).getTime() - new Date(b.LogDate).getTime()
  );
};

exports.fetchDeviceLogsSince = async (sinceTime, overrideConfig) => {
  const driver = getDriver(overrideConfig);
  const since = sinceTime instanceof Date ? sinceTime : new Date(String(sinceTime || ''));
  if (Number.isNaN(since.getTime())) {
    throw new Error('Invalid lastSyncedTime');
  }

  if (driver === 'access') {
    return fetchAccessDeviceLogsSince(since, overrideConfig);
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
