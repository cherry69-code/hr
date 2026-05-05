const odbc = require('odbc');

const toAccessDateLiteral = (value) => {
  const dt = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(dt.getTime())) throw new Error('Invalid Access date');
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `#${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}#`;
};

const normalizeKey = (value) => String(value ?? '').trim().toLowerCase();

const toDate = (raw) => {
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
  return { hours, minutes, seconds };
};

const combineDateAndTime = (baseDateRaw, timeRaw) => {
  const baseDate = toDate(baseDateRaw);
  if (!baseDate) return null;
  const parsed = parseTimeLike(timeRaw);
  if (!parsed) return baseDate;
  if (parsed instanceof Date) return parsed;
  const combined = new Date(baseDate);
  combined.setHours(parsed.hours, parsed.minutes, parsed.seconds, 0);
  return combined;
};

const normalizePunchType = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'OUT' || normalized === 'O' ? 'OUT' : 'IN';
};

const buildConnectionString = (config) =>
  [
    'Driver={Microsoft Access Driver (*.mdb, *.accdb)}',
    `Dbq=${config.databasePath}`,
    `Uid=${config.dbUser}`,
    `Pwd=${config.dbPassword || ''}`
  ].join(';') + ';';

async function runQuery(conn, sql) {
  const rows = await conn.query(sql);
  return Array.isArray(rows) ? rows : [];
}

async function buildEmployeeResolver(conn) {
  const rows = await runQuery(
    conn,
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
  for (const row of rows) {
    const preferredCode = String(row.EmployeeCodeInDevice || row.EmployeeCode || row.StringCode || row.NumericCode || row.EmployeeId || '').trim();
    if (!preferredCode) continue;
    for (const key of [row.EmployeeId, row.EmployeeCode, row.EmployeeCodeInDevice, row.NumericCode, row.StringCode]) {
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
}

exports.fetchPunchesSince = async (config, sinceTime) => {
  const connection = await odbc.connect(buildConnectionString(config));
  const since = toAccessDateLiteral(sinceTime);

  try {
    const resolveEmployeeCode = await buildEmployeeResolver(connection);
    const deviceLogs = await runQuery(
      connection,
      `
        SELECT [UserId], [LogDate], [DeviceId], [Direction]
        FROM [DeviceLogs]
        WHERE [LogDate] > ${since}
        ORDER BY [LogDate] ASC
      `
    ).catch(() => []);

    const attendanceIns = await runQuery(
      connection,
      `
        SELECT [AttendanceDate], [EmployeeId], [InTime], [InDeviceId]
        FROM [AttendanceLogs]
        WHERE [InTime] IS NOT NULL AND [AttendanceDate] >= ${since}
        ORDER BY [AttendanceDate] ASC
      `
    ).catch(() => []);

    const attendanceOuts = await runQuery(
      connection,
      `
        SELECT [AttendanceDate], [EmployeeId], [OutTime], [OutDeviceId]
        FROM [AttendanceLogs]
        WHERE [OutTime] IS NOT NULL AND [AttendanceDate] >= ${since}
        ORDER BY [AttendanceDate] ASC
      `
    ).catch(() => []);

    const punchTimeRows = await runQuery(
      connection,
      `
        SELECT [tktno], [date], [INOUT]
        FROM [PunchTimeDetails]
        WHERE [date] > ${since}
        ORDER BY [date] ASC
      `
    ).catch(() => []);

    const rows = [
      ...deviceLogs.map((row) => ({
        employee_code: resolveEmployeeCode(row.UserId),
        punch_time: toDate(row.LogDate),
        device_id: String(row.DeviceId || config.deviceId || '').trim(),
        punch_type: normalizePunchType(row.Direction),
        verification_type: 'unknown',
        source: 'etime-agent'
      })),
      ...attendanceIns.map((row) => ({
        employee_code: resolveEmployeeCode(row.EmployeeId),
        punch_time: combineDateAndTime(row.AttendanceDate, row.InTime),
        device_id: String(row.InDeviceId || config.deviceId || '').trim(),
        punch_type: 'IN',
        verification_type: 'unknown',
        source: 'etime-agent'
      })),
      ...attendanceOuts.map((row) => ({
        employee_code: resolveEmployeeCode(row.EmployeeId),
        punch_time: combineDateAndTime(row.AttendanceDate, row.OutTime),
        device_id: String(row.OutDeviceId || config.deviceId || '').trim(),
        punch_type: 'OUT',
        verification_type: 'unknown',
        source: 'etime-agent'
      })),
      ...punchTimeRows.map((row) => ({
        employee_code: resolveEmployeeCode(row.tktno),
        punch_time: toDate(row.date),
        device_id: config.deviceId,
        punch_type: normalizePunchType(row.INOUT),
        verification_type: 'unknown',
        source: 'etime-agent'
      }))
    ];

    const seen = new Set();
    return rows
      .filter((row) => row.employee_code && row.punch_time)
      .filter((row) => {
        const uniqueKey = `${row.employee_code}|${new Date(row.punch_time).toISOString()}|${row.punch_type}`;
        if (seen.has(uniqueKey)) return false;
        seen.add(uniqueKey);
        return true;
      })
      .sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
  } finally {
    await connection.close().catch(() => null);
  }
};
