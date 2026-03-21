const crypto = require('crypto');

const BiometricDevice = require('../models/BiometricDevice');
const BiometricLog = require('../models/BiometricLog');
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

  const dayKeys = new Set();
  const deviceCache = new Map();
  let latestPunch = null;

  const writes = [];
  for (const r of batch) {
    const employeeCode = String(r.USERID ?? '').trim();
    const checkTime = new Date(r.CHECKTIME);
    if (!employeeCode || Number.isNaN(checkTime.getTime())) continue;

    const dk = `${employeeCode}|${ymd(checkTime)}`;
    dayKeys.add(dk);

    if (!latestPunch || checkTime.getTime() > latestPunch.getTime()) latestPunch = checkTime;

    const sensor = String(r.SENSORID ?? '').trim();
    let deviceId = sensor || 'UNKNOWN';
    if (sensor) {
      if (deviceCache.has(sensor)) deviceId = deviceCache.get(sensor);
      else {
        deviceId = await resolveDeviceIdFromSensor(sensor);
        deviceCache.set(sensor, deviceId);
      }
    }

    const uniqueKey = `${employeeCode}|${checkTime.toISOString()}`;
    writes.push({
      updateOne: {
        filter: { uniqueKey },
        update: {
          $setOnInsert: {
            uniqueKey,
            employeeCode,
            deviceId,
            punchTime: checkTime,
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
  if (writes.length) {
    const result = await BiometricLog.bulkWrite(writes, { ordered: false }).catch(() => null);
    upserted = Number(result?.upsertedCount || 0);
  }

  const enforceEmployee = shouldEnforceEmployeeExists();
  let processedDays = 0;

  for (const key of dayKeys) {
    const [employeeCode, dayStr] = key.split('|');
    const dayDate = new Date(`${dayStr}T00:00:00.000Z`);
    if (Number.isNaN(dayDate.getTime())) continue;
    const { start, end } = dayBounds(dayDate);

    const employee = await User.findOne({ employeeId: employeeCode }).select('_id fullName employeeId email officialEmail personalEmail shiftId joiningDate').lean();
    if (!employee) {
      if (enforceEmployee) continue;
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
      ? await upsertAttendanceFromPunches({ employee, deviceId, day: start, punches, source: 'BIOMETRIC' })
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
      { $set: { lastSyncedTime: latestPunch, lastRunAt: Date.now(), lastRunStatus: 'ok', lastRunMessage: '' } },
      { upsert: true }
    );
  } else {
    await SyncMeta.updateOne(
      { key: META_KEY },
      { $set: { lastRunAt: Date.now(), lastRunStatus: 'ok', lastRunMessage: '' } },
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
    lastSyncedTime: latestPunch ? latestPunch.toISOString() : null
  };
};

exports.getEtimeSyncStatus = async () => {
  const cfg = await getEtimeConfig().catch(() => null);
  const meta = await ensureMeta(cfg);
  return { enabled: isEnabled(cfg), meta };
};

exports.hashDeviceToken = (tokenPlain) => {
  const token = String(tokenPlain || '').trim();
  if (!token) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
};
