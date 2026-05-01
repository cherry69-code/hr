const crypto = require('crypto');

const BiometricDevice = require('../models/BiometricDevice');
const BiometricLog = require('../models/BiometricLog');
const BiometricEmployeeMapping = require('../models/BiometricEmployeeMapping');
const BiometricSyncIssue = require('../models/BiometricSyncIssue');
const SyncMeta = require('../models/SyncMeta');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');

const { fetchCheckinOutSince } = require('../integrations/etime/etimeDb');
const { upsertAttendanceFromPunches } = require('./attendanceEngine');
const { sendCategorizedEmail, EmailType } = require('../utils/emailRouter');
const { sendAdminAlert } = require('../utils/adminAlerts');
const { getEtimeConfig } = require('./etimeConfigService');

const META_KEY = 'etime_checkinout';
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const mapPunchType = (checkType) => {
  const t = String(checkType || '').trim().toUpperCase();
  if (t === 'I') return 'IN';
  if (t === 'O') return 'OUT';
  return 'IN';
};

const mapVerificationType = (verifyCode) => {
  const code = Number(verifyCode);
  if (code === 1) return 'fingerprint';
  if (code === 15) return 'face';
  if (code === 0) return 'rfid';
  return 'unknown';
};

const ymd = (d) => {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dayBounds = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const start = new Date(date);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getInitialSince = (cfg) => {
  const fromCfg = cfg?.startFrom instanceof Date && !Number.isNaN(cfg.startFrom.getTime()) ? cfg.startFrom : null;
  if (fromCfg) return fromCfg;
  const envStart = String(process.env.ETIME_SYNC_START_FROM || '').trim();
  if (envStart) {
    const dt = new Date(envStart);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
};

const resolveDeviceIdFromSensor = async (sensorId) => {
  const sensor = String(sensorId || '').trim();
  if (!sensor) return 'UNKNOWN';
  const device = await BiometricDevice.findOne({
    $or: [{ etimeSensorId: sensor }, { deviceId: sensor }]
  })
    .select('deviceId')
    .lean();
  return device?.deviceId || sensor;
};

const toEmployeeCode = (row) => String(row?.UserId ?? row?.USERID ?? '').trim();

const toPunchTime = (row) => {
  const raw = row?.LogDate ?? row?.LOGDATE ?? row?.CHECKTIME;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const toDeviceSourceId = (row) =>
  String(row?.DeviceId ?? row?.DEVICEID ?? row?.SENSORID ?? '').trim();

const getTimezone = (cfg) => {
  const tz = String(cfg?.timezone || process.env.ETIME_TIMEZONE || DEFAULT_TIMEZONE).trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

const makeIssueKey = (issueType, employeeCode, punchTime) =>
  `${issueType}|${String(employeeCode || '').trim()}|${punchTime ? new Date(punchTime).toISOString() : 'na'}`;

const upsertSyncIssue = async ({ issueType, employeeCode, punchTime, employeeId, message, rawPayload }) => {
  const issueKey = makeIssueKey(issueType, employeeCode, punchTime);
  await BiometricSyncIssue.findOneAndUpdate(
    { issueKey },
    {
      $set: {
        issueType,
        status: 'open',
        etimeUserId: String(employeeCode || '').trim(),
        employeeId: employeeId || undefined,
        punchTime: punchTime || undefined,
        message: String(message || '').trim(),
        rawPayload: rawPayload || undefined
      },
      $setOnInsert: {
        retryCount: 0
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
};

const resolveEmployeeForEtimeUserId = async (etimeUserId) => {
  const code = String(etimeUserId || '').trim();
  if (!code) return { employee: null, mapping: null, resolution: 'missing' };

  const mapping = await BiometricEmployeeMapping.findOne({ etimeUserId: code, active: true })
    .populate('employeeId', '_id fullName employeeId email officialEmail personalEmail shiftId joiningDate')
    .lean();

  if (mapping?.employeeId?._id) {
    return {
      employee: mapping.employeeId,
      mapping,
      resolution: 'explicit'
    };
  }

  const employee = await User.findOne({ employeeId: code })
    .select('_id fullName employeeId email officialEmail personalEmail shiftId joiningDate')
    .lean();
  if (employee) {
    return { employee, mapping: null, resolution: 'direct' };
  }

  return { employee: null, mapping: mapping || null, resolution: mapping ? 'invalid' : 'missing' };
};

const validateMappingsForBatch = async (rows) => {
  const uniqueCodes = Array.from(
    new Set(
      (rows || [])
        .map((row) => toEmployeeCode(row))
        .filter(Boolean)
    )
  );

  const resolutions = [];
  for (const etimeUserId of uniqueCodes) {
    resolutions.push({ etimeUserId, ...(await resolveEmployeeForEtimeUserId(etimeUserId)) });
  }

  const missing = resolutions.filter((r) => !r.employee);
  return {
    valid: missing.length === 0,
    total: uniqueCodes.length,
    missing,
    explicit: resolutions.filter((r) => r.resolution === 'explicit').length,
    direct: resolutions.filter((r) => r.resolution === 'direct').length
  };
};

const ensureMeta = async (cfg) => {
  const existing = await SyncMeta.findOne({ key: META_KEY }).lean();
  if (existing) return existing;
  const created = await SyncMeta.create({ key: META_KEY, lastSyncedTime: getInitialSince(cfg) });
  return created.toObject ? created.toObject() : created;
};

const isEnabled = (cfg) => {
  if (cfg && cfg.enabled !== undefined) return Boolean(cfg.enabled);
  return String(process.env.ETIME_SYNC_ENABLED || '').toLowerCase() === 'true';
};

const shouldEnforceEmployeeExists = () =>
  String(process.env.ETIME_ENFORCE_EMPLOYEE_EXISTS || 'true').toLowerCase() === 'true';

const computeEmployeeLeaveDaysInMonth = async ({ employeeId, monthStart, monthEnd }) => {
  const leaves = await Leave.find({
    employeeId,
    status: 'approved',
    fromDate: { $lte: monthEnd },
    toDate: { $gte: monthStart }
  })
    .select('fromDate toDate')
    .lean();

  const leaveDays = new Set();
  for (const l of leaves) {
    const s = new Date(l.fromDate);
    const e = new Date(l.toDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);
    const cur = new Date(s);
    while (cur.getTime() <= e.getTime()) {
      if (cur.getTime() >= monthStart.getTime() && cur.getTime() <= monthEnd.getTime()) {
        leaveDays.add(ymd(cur));
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return leaveDays;
};

const upsertAbsentsForMonth = async ({ employee, monthStart, monthEnd }) => {
  const employeeId = employee._id;
  const jd = employee.joiningDate ? new Date(employee.joiningDate) : null;
  let effectiveStart = new Date(monthStart);
  if (jd && !Number.isNaN(jd.getTime())) {
    const joinStart = new Date(jd);
    joinStart.setHours(0, 0, 0, 0);
    if (joinStart.getTime() > monthEnd.getTime()) return;
    if (joinStart.getTime() > effectiveStart.getTime()) effectiveStart = joinStart;
  }

  const leaveDays = await computeEmployeeLeaveDaysInMonth({ employeeId, monthStart: effectiveStart, monthEnd });

  const existing = await Attendance.find({
    employeeId,
    date: { $gte: effectiveStart, $lte: monthEnd }
  })
    .select('date')
    .lean();
  const existingDays = new Set((existing || []).map((a) => ymd(a.date)));

  const writes = [];
  const cur = new Date(effectiveStart);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(monthEnd);
  last.setHours(0, 0, 0, 0);
  while (cur.getTime() <= last.getTime()) {
    const key = ymd(cur);
    const dow = cur.getDay();
    const isBiometricMandatory = [2, 3, 4, 5].includes(dow);
    if (isBiometricMandatory && !existingDays.has(key) && !leaveDays.has(key)) {
      const start = new Date(cur);
      start.setHours(0, 0, 0, 0);
      writes.push({
        insertOne: {
          document: {
            employeeId,
            date: start,
            status: 'Absent',
            source: 'BIOMETRIC',
            locationName: 'Office (Biometric)',
            locationValidated: true,
            insideRadius: true
          }
        }
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  if (!writes.length) return;
  await Attendance.bulkWrite(writes, { ordered: false }).catch(() => {});
};

exports.runEtimeSyncOnce = async ({ maxRows } = {}) => {
  const cfg = await getEtimeConfig().catch(() => null);
  if (!isEnabled(cfg)) {
    return { enabled: false, fetched: 0, upserted: 0, processedDays: 0 };
  }

  const meta = await ensureMeta(cfg);
  const since = meta.lastSyncedTime ? new Date(meta.lastSyncedTime) : getInitialSince(cfg);
  const rows = await fetchCheckinOutSince(since, cfg || undefined);

  const cap = maxRows ? Math.max(1, Number(maxRows)) : 20000;
  const batch = Array.isArray(rows) ? rows.slice(0, cap) : [];
  const timezone = getTimezone(cfg);

  const mappingValidation = await validateMappingsForBatch(batch);
  if (!mappingValidation.valid) {
    for (const missing of mappingValidation.missing) {
      const sample = batch.find((row) => toEmployeeCode(row) === missing.etimeUserId);
      await upsertSyncIssue({
        issueType: missing.resolution === 'invalid' ? 'employee_mapping_invalid' : 'employee_mapping_missing',
        employeeCode: missing.etimeUserId,
        punchTime: toPunchTime(sample),
        message:
          missing.resolution === 'invalid'
            ? `Mapped HRMS employee is invalid for eSSL UserId ${missing.etimeUserId}`
            : `No HRMS employee mapping found for eSSL UserId ${missing.etimeUserId}`,
        rawPayload: sample || undefined
      });
    }

    const report = {
      source: 'DeviceLogs',
      timezone,
      fetchedRows: batch.length,
      insertedRows: 0,
      processedDays: 0,
      duplicateRowsSkipped: 0,
      duplicateRowsInBatch: 0,
      unmappedEmployeeIds: mappingValidation.missing.map((m) => m.etimeUserId),
      mappingSummary: {
        totalIds: mappingValidation.total,
        explicit: mappingValidation.explicit,
        direct: mappingValidation.direct,
        missing: mappingValidation.missing.length
      }
    };
    await SyncMeta.updateOne(
      { key: META_KEY },
      {
        $set: {
          lastRunAt: Date.now(),
          lastRunStatus: 'error',
          lastRunMessage: `Employee mapping validation failed for ${mappingValidation.missing.length} eSSL ID(s)`,
          lastReport: report
        }
      },
      { upsert: true }
    );
    const err = new Error(`Employee mapping validation failed for ${mappingValidation.missing.length} eSSL ID(s)`);
    err.statusCode = 400;
    throw err;
  }

  const dayKeys = new Set();
  const deviceCache = new Map();
  let latestPunch = null;

  const writes = [];
  const uniqueKeys = [];
  const seenInBatch = new Set();
  let duplicateRowsInBatch = 0;
  let invalidRows = 0;
  for (const r of batch) {
    const employeeCode = toEmployeeCode(r);
    const checkTime = toPunchTime(r);
    if (!employeeCode || !checkTime) {
      invalidRows += 1;
      await upsertSyncIssue({
        issueType: 'invalid_timestamp',
        employeeCode,
        punchTime: null,
        message: 'DeviceLogs row has invalid or missing timestamp',
        rawPayload: r
      });
      continue;
    }

    const dk = `${employeeCode}|${ymd(checkTime)}`;
    dayKeys.add(dk);

    if (!latestPunch || checkTime.getTime() > latestPunch.getTime()) latestPunch = checkTime;

    const sensor = toDeviceSourceId(r);
    let deviceId = sensor || 'UNKNOWN';
    if (sensor) {
      if (deviceCache.has(sensor)) deviceId = deviceCache.get(sensor);
      else {
        deviceId = await resolveDeviceIdFromSensor(sensor);
        deviceCache.set(sensor, deviceId);
      }
    }

    const uniqueKey = `${employeeCode}|${checkTime.toISOString()}`;
    if (seenInBatch.has(uniqueKey)) {
      duplicateRowsInBatch += 1;
      continue;
    }
    seenInBatch.add(uniqueKey);
    uniqueKeys.push(uniqueKey);
    writes.push({
      updateOne: {
        filter: { uniqueKey },
        update: {
          $setOnInsert: {
            uniqueKey,
            employeeCode,
            deviceId,
            punchTime: checkTime,
            // DeviceLogs contains raw punches only, so IN/OUT is derived later from first/last punch of day.
            punchType: mapPunchType(r.CHECKTYPE),
            verificationType: mapVerificationType(r.VERIFYCODE),
            source: 'etime',
            rawPayload: r,
            processed: false,
            receivedAt: Date.now()
          }
        },
        upsert: true
      }
    });
  }

  let upserted = 0;
  let duplicateRowsSkipped = 0;
  if (writes.length) {
    const existingKeys = await BiometricLog.find({ uniqueKey: { $in: uniqueKeys } }).select('uniqueKey').lean();
    const existingSet = new Set((existingKeys || []).map((row) => String(row.uniqueKey || '')));
    duplicateRowsSkipped = existingSet.size;
    const filteredWrites = writes.filter((w) => !existingSet.has(String(w.updateOne?.filter?.uniqueKey || '')));
    const result = filteredWrites.length
      ? await BiometricLog.bulkWrite(filteredWrites, { ordered: false }).catch(() => null)
      : null;
    upserted = Number(result?.upsertedCount || 0);
  }

  const enforceEmployee = shouldEnforceEmployeeExists();
  let processedDays = 0;

  for (const key of dayKeys) {
    const [employeeCode, dayStr] = key.split('|');
    const dayDate = new Date(`${dayStr}T00:00:00.000Z`);
    if (Number.isNaN(dayDate.getTime())) continue;
    const { start, end } = dayBounds(dayDate);

    const resolved = await resolveEmployeeForEtimeUserId(employeeCode);
    const employee = resolved.employee;
    if (!employee) {
      if (enforceEmployee) {
        await upsertSyncIssue({
          issueType: 'employee_mapping_missing',
          employeeCode,
          punchTime: start,
          message: `No HRMS employee mapping found for eSSL UserId ${employeeCode}`
        });
        continue;
      }
    }

    const dayLogs = await BiometricLog.find({
      employeeCode,
      punchTime: { $gte: start, $lte: end }
    })
      .select('punchTime deviceId')
      .lean();

    if (!dayLogs.length) continue;
    const deviceId = String(dayLogs[dayLogs.length - 1]?.deviceId || 'UNKNOWN');
    const punches = dayLogs.map((l) => l.punchTime);

    const attendance = employee
      ? await upsertAttendanceFromPunches({ employee, deviceId, day: start, punches, source: 'BIOMETRIC' }).catch(async (e) => {
          await upsertSyncIssue({
            issueType: 'sync_processing_failed',
            employeeCode,
            employeeId: employee._id,
            punchTime: start,
            message: String(e?.message || e || 'Attendance processing failed')
          });
          return null;
        })
      : null;

    await BiometricLog.updateMany(
      { employeeCode, punchTime: { $gte: start, $lte: end }, processed: false },
      { $set: { processed: true, processedAt: Date.now() } }
    ).catch(() => {});

    if (attendance && attendance.status === 'Missed Punch' && !attendance.missedPunchNotifiedAt) {
      try {
        await sendCategorizedEmail(employee, EmailType.OPERATIONAL, {
          subject: 'Missed Punch Alert',
          text: `Only one biometric punch was detected on ${new Date(attendance.date).toDateString()}. Please contact HR for correction.`,
          html: `<p>Only one biometric punch was detected on <b>${new Date(attendance.date).toDateString()}</b>. Please contact HR for correction.</p>`
        });
      } catch {}
      try {
        await sendAdminAlert({
          subject: `Missed Punch: ${employee.fullName} (${employee.employeeId})`,
          text: `Only one biometric punch detected on ${new Date(attendance.date).toDateString()}.`,
          html: `<p>Only one biometric punch detected.</p><p>Employee: ${employee.fullName} (${employee.employeeId})</p><p>Date: ${new Date(attendance.date).toDateString()}</p>`
        });
      } catch {}
      await Attendance.updateOne(
        { _id: attendance._id },
        { $set: { missedPunchNotifiedAt: Date.now() } }
      ).catch(() => {});
    }

    processedDays += 1;
  }

  if (latestPunch) {
    await SyncMeta.updateOne(
      { key: META_KEY },
      {
        $set: {
          lastSyncedTime: latestPunch,
          lastRunAt: Date.now(),
          lastRunStatus: 'ok',
          lastRunMessage: '',
          lastReport: {
            source: 'DeviceLogs',
            timezone,
            fetchedRows: batch.length,
            insertedRows: upserted,
            processedDays,
            duplicateRowsSkipped,
            duplicateRowsInBatch,
            invalidRows,
            unmappedEmployeeIds: [],
            mappingSummary: {
              totalIds: mappingValidation.total,
              explicit: mappingValidation.explicit,
              direct: mappingValidation.direct,
              missing: 0
            }
          }
        }
      },
      { upsert: true }
    );
  } else {
    await SyncMeta.updateOne(
      { key: META_KEY },
      {
        $set: {
          lastRunAt: Date.now(),
          lastRunStatus: 'ok',
          lastRunMessage: '',
          lastReport: {
            source: 'DeviceLogs',
            timezone,
            fetchedRows: batch.length,
            insertedRows: upserted,
            processedDays,
            duplicateRowsSkipped,
            duplicateRowsInBatch,
            invalidRows,
            unmappedEmployeeIds: [],
            mappingSummary: {
              totalIds: mappingValidation.total,
              explicit: mappingValidation.explicit,
              direct: mappingValidation.direct,
              missing: 0
            }
          }
        }
      },
      { upsert: true }
    );
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const touchedEmployees = new Set(Array.from(dayKeys).map((k) => k.split('|')[0]));
  for (const employeeCode of touchedEmployees) {
    const employee = await User.findOne({ employeeId: employeeCode }).select('_id employeeId joiningDate').lean();
    if (!employee) continue;
    await upsertAbsentsForMonth({ employee, monthStart, monthEnd });
  }

  return {
    enabled: true,
    fetched: batch.length,
    upserted,
    processedDays,
    duplicateRowsSkipped,
    duplicateRowsInBatch,
    timezone,
    lastSyncedTime: latestPunch ? latestPunch.toISOString() : null
  };
};

exports.getEtimeSyncStatus = async () => {
  const cfg = await getEtimeConfig().catch(() => null);
  const meta = await ensureMeta(cfg);
  return { enabled: isEnabled(cfg), meta };
};

exports.getEtimeSyncReport = async () => {
  const cfg = await getEtimeConfig().catch(() => null);
  const meta = await ensureMeta(cfg);
  const openIssues = await BiometricSyncIssue.countDocuments({ status: 'open' }).catch(() => 0);
  const mappingCount = await BiometricEmployeeMapping.countDocuments({ active: true }).catch(() => 0);
  return {
    timezone: getTimezone(cfg),
    openIssues,
    activeMappings: mappingCount,
    report: meta?.lastReport || null,
    meta
  };
};

exports.retryBiometricSyncIssue = async (issueId) => {
  const issue = await BiometricSyncIssue.findById(issueId);
  if (!issue) {
    const err = new Error('Sync issue not found');
    err.statusCode = 404;
    throw err;
  }

  issue.status = 'retrying';
  issue.retryCount = Number(issue.retryCount || 0) + 1;
  issue.lastRetriedAt = new Date();
  await issue.save();

  const result = await exports.runEtimeSyncOnce({ maxRows: 2000 });

  const fresh = await BiometricSyncIssue.findById(issueId);
  if (fresh) {
    fresh.status = 'resolved';
    fresh.resolvedAt = new Date();
    await fresh.save();
  }

  return result;
};

exports.hashDeviceToken = (tokenPlain) => {
  const token = String(tokenPlain || '').trim();
  if (!token) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
};
