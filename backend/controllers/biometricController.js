const BiometricDevice = require('../models/BiometricDevice');
const BiometricEmployeeMapping = require('../models/BiometricEmployeeMapping');
const BiometricLog = require('../models/BiometricLog');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const cloudinary = require('../config/cloudinary');
const crypto = require('crypto');
const { upsertAttendanceFromPunches } = require('../services/attendanceEngine');
const { getBusinessDayBounds } = require('../utils/businessTime');

const getDeviceTokenFromRequest = (req) =>
  String(req.headers['x-biometric-token'] || '').trim() ||
  String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

const validateDeviceToken = async (deviceId, token) => {
  const normalizedDeviceId = String(deviceId || 'UNKNOWN').trim() || 'UNKNOWN';
  const device = await BiometricDevice.findOne({ deviceId: normalizedDeviceId }).lean();
  if (!device) {
    const err = new Error('Invalid device_id');
    err.statusCode = 403;
    throw err;
  }
  if (device.apiTokenHash) {
    if (!token) {
      const err = new Error('Missing device token');
      err.statusCode = 403;
      throw err;
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== device.apiTokenHash) {
      const err = new Error('Invalid device token');
      err.statusCode = 403;
      throw err;
    }
  }
  return device;
};

const normalizePunchType = (value) => {
  const punchType = String(value || 'IN').trim().toUpperCase();
  if (['IN', 'OUT', 'BREAK_IN', 'BREAK_OUT', 'CHECK_IN', 'CHECK_OUT'].includes(punchType)) return punchType;
  return 'IN';
};

const normalizeVerificationType = (value) => {
  const verificationType = String(value || 'unknown').trim().toLowerCase();
  if (['face', 'fingerprint', 'rfid', 'password', 'unknown'].includes(verificationType)) return verificationType;
  return 'unknown';
};

const getDayKey = (date) => {
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
};

const getEmployeeForCode = async (employeeCode) => {
  const direct = await User.findOne({ employeeId: employeeCode }).lean();
  if (direct) return direct;

  const mapping = await BiometricEmployeeMapping.findOne({ etimeUserId: employeeCode, active: true })
    .populate('employeeId')
    .lean();
  return mapping?.employeeId || null;
};

const rebuildAttendanceForEmployeeDay = async (employeeCode, day, fallbackDeviceId) => {
  const employee = await getEmployeeForCode(employeeCode);
  if (!employee) {
    return { employeeFound: false, attendance: null };
  }

  const { start, end } = getBusinessDayBounds(day);
  const dayLogs = await BiometricLog.find({
    employeeCode,
    punchTime: { $gte: start, $lte: end }
  })
    .select('punchTime deviceId')
    .sort({ punchTime: 1 })
    .lean();

  if (!dayLogs.length) {
    return { employeeFound: true, attendance: null };
  }

  const punches = dayLogs.map((log) => log.punchTime);
  const deviceId = String(dayLogs[dayLogs.length - 1]?.deviceId || fallbackDeviceId || 'UNKNOWN').trim() || 'UNKNOWN';
  const attendance = await upsertAttendanceFromPunches({
    employee,
    deviceId,
    day: start,
    punches,
    source: 'BIOMETRIC'
  });
  return { employeeFound: true, attendance };
};

// @desc    Register/Add a new Biometric Device
// @route   POST /api/biometric/devices
// @access  Private (Admin)
exports.addDevice = asyncHandler(async (req, res, next) => {
  const { deviceId, deviceName, deviceIp, deviceLocation, deviceType } = req.body;

  const existing = await BiometricDevice.findOne({ deviceId });
  if (existing) {
    return res.status(400).json({ success: false, error: 'Device ID already exists' });
  }

  const device = await BiometricDevice.create(req.body);
  res.status(201).json({ success: true, data: device });
});

// @desc    Get all Biometric Devices
// @route   GET /api/biometric/devices
// @access  Private (Admin)
exports.getDevices = asyncHandler(async (req, res, next) => {
  const devices = await BiometricDevice.find().sort('-createdAt');
  res.status(200).json({ success: true, count: devices.length, data: devices });
});

// @desc    Process Biometric Punch (Push API)
// @route   POST /api/biometric/punch (legacy)
// @route   POST /api/biometric/logs (preferred)
// @access  Public (Secured by IP Whitelist Middleware)
exports.processPunch = asyncHandler(async (req, res, next) => {
  const {
    employee_code,
    timestamp,
    punch_time,
    device_id,
    punch_type,
    verification_type,
    source,
    image_base64
  } = req.body;

  const punchTimeRaw = punch_time || timestamp;
  if (!employee_code || !punchTimeRaw) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const employeeCode = String(employee_code || '').trim();
  const deviceId = String(device_id || 'UNKNOWN').trim() || 'UNKNOWN';
  const token = getDeviceTokenFromRequest(req);
  await validateDeviceToken(deviceId, token);

  // 1. Upload Photo if provided (Anti-Proxy)
  let imageUrl = '';
  if (image_base64) {
    try {
      const result = await cloudinary.uploader.upload(image_base64, {
        folder: 'attendance/biometric',
        public_id: `${employeeCode}_${Date.now()}`
      });
      imageUrl = result.secure_url;
    } catch (err) {
      console.error('Biometric Image Upload Failed:', err.message);
    }
  }

  // 2. Log Raw Punch
  const punchTime = new Date(punchTimeRaw);
  if (Number.isNaN(punchTime.getTime())) {
    return res.status(400).json({ success: false, error: 'Invalid timestamp' });
  }
  const uniqueKey = `${employeeCode}|${punchTime.toISOString()}`;

  await BiometricLog.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        uniqueKey,
        employeeCode,
        deviceId,
        punchTime,
        punchType: normalizePunchType(punch_type),
        verificationType: normalizeVerificationType(verification_type),
        source: String(source || 'BIOMETRIC').toLowerCase() === 'etime' ? 'etime' : 'BIOMETRIC',
        imageUrl,
        rawPayload: req.body,
        processed: false,
        receivedAt: Date.now()
      }
    },
    { upsert: true }
  );

  const log = await BiometricLog.findOne({ uniqueKey }).lean();

  // 3. Process Attendance Logic (Sync immediately or async?)
  // We'll process immediately for real-time updates.
  
  // Find Employee
  const employee = await User.findOne({ employeeId: employeeCode });
  if (!employee) {
    // Log exists but user not found (maybe not synced yet)
    return res.status(200).json({ success: true, message: 'Log received. Employee not found.', logId: log?._id });
  }

  const punchDate = new Date(punchTime);
  const { start: startOfDay, end: endOfDay } = getBusinessDayBounds(punchDate);

  const dayLogs = await BiometricLog.find({
    employeeCode,
    punchTime: { $gte: startOfDay, $lte: endOfDay }
  })
    .select('punchTime')
    .lean();

  const punches = (dayLogs || []).map((l) => l.punchTime);
  const attendance = await upsertAttendanceFromPunches({
    employee,
    deviceId,
    day: startOfDay,
    punches,
    source: 'BIOMETRIC'
  });

  await BiometricLog.updateOne({ uniqueKey }, { $set: { processed: true, processedAt: Date.now() } });

  // Update Device Last Sync
  await BiometricDevice.findOneAndUpdate({ deviceId }, { lastSyncAt: Date.now() });

  res.status(200).json({ success: true, message: 'Punch processed successfully', attendance });
});

// @desc    Process Biometric Agent Logs (batch push API)
// @route   POST /api/biometric/agent/logs
// @access  Public (Secured by Device Token)
exports.processAgentLogs = asyncHandler(async (req, res) => {
  const deviceId = String(req.body?.device_id || req.body?.deviceId || 'UNKNOWN').trim() || 'UNKNOWN';
  const token = getDeviceTokenFromRequest(req);
  await validateDeviceToken(deviceId, token);

  const rawLogs = Array.isArray(req.body?.logs) ? req.body.logs : [];
  if (!rawLogs.length) {
    return res.status(400).json({ success: false, error: 'logs array is required' });
  }

  const ingestLimit = 5000;
  const logs = rawLogs.slice(0, ingestLimit);
  const touchedDays = new Map();
  let accepted = 0;
  let duplicates = 0;
  let invalid = 0;
  let processed = 0;

  for (const row of logs) {
    const employeeCode = String(row?.employee_code || row?.employeeCode || '').trim();
    const punchTimeRaw = row?.punch_time || row?.punchTime || row?.timestamp || row?.logDate;
    const punchTime = new Date(punchTimeRaw);

    if (!employeeCode || Number.isNaN(punchTime.getTime())) {
      invalid += 1;
      continue;
    }

    const uniqueKey = `${employeeCode}|${punchTime.toISOString()}`;
    const normalizedDeviceId = String(row?.device_id || row?.deviceId || deviceId).trim() || deviceId;
    const result = await BiometricLog.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          uniqueKey,
          employeeCode,
          deviceId: normalizedDeviceId,
          punchTime,
          punchType: normalizePunchType(row?.punch_type || row?.punchType),
          verificationType: normalizeVerificationType(row?.verification_type || row?.verificationType),
          source: 'etime',
          rawPayload: row,
          processed: false,
          receivedAt: Date.now()
        }
      },
      { upsert: true }
    );

    if (Number(result?.upsertedCount || 0) > 0) {
      accepted += 1;
      const dayKey = `${employeeCode}|${getDayKey(punchTime)}`;
      if (dayKey) {
        touchedDays.set(dayKey, { employeeCode, day: punchTime, deviceId: normalizedDeviceId });
      }
    } else {
      duplicates += 1;
    }
  }

  const attendanceResults = [];
  for (const { employeeCode, day, deviceId: dayDeviceId } of touchedDays.values()) {
    const result = await rebuildAttendanceForEmployeeDay(employeeCode, day, dayDeviceId);
    if (result.employeeFound && result.attendance) {
      processed += 1;
      attendanceResults.push({
        employeeCode,
        date: result.attendance.date,
        status: result.attendance.status
      });
    }

    const { start, end } = getBusinessDayBounds(day);
    await BiometricLog.updateMany(
      {
        employeeCode,
        punchTime: { $gte: start, $lte: end },
        processed: false
      },
      { $set: { processed: true, processedAt: Date.now() } }
    ).catch(() => {});
  }

  await BiometricDevice.updateOne({ deviceId }, { $set: { lastSyncAt: new Date() } }).catch(() => {});

  res.status(200).json({
    success: true,
    data: {
      deviceId,
      received: logs.length,
      accepted,
      duplicates,
      invalid,
      processedDays: processed,
      attendanceResults
    }
  });
});

// @desc    Get Biometric Logs
// @route   GET /api/biometric/logs
// @access  Private (Admin)
exports.getLogs = asyncHandler(async (req, res, next) => {
  let query = {};
  if (req.query.employeeCode) {
    query.employeeCode = req.query.employeeCode;
  }
  if (req.query.deviceId) {
    query.deviceId = req.query.deviceId;
  }
  if (req.query.source) {
    query.source = req.query.source;
  }
  if (req.query.date) {
    const d = new Date(req.query.date);
    const start = new Date(d.setHours(0,0,0,0));
    const end = new Date(d.setHours(23,59,59,999));
    query.punchTime = { $gte: start, $lte: end };
  }

  const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
  const logs = await BiometricLog.find(query).sort('-punchTime').limit(limit);
  res.status(200).json({ success: true, count: logs.length, data: logs });
});

// @desc    Get biometric employee mappings + unmapped IDs
// @route   GET /api/biometric/mappings
// @access  Private (Admin)
exports.getMappings = asyncHandler(async (req, res) => {
  const BiometricSyncIssue = require('../models/BiometricSyncIssue');
  const mappings = await BiometricEmployeeMapping.find()
    .populate('employeeId', '_id fullName employeeId email designation status')
    .sort({ updatedAt: -1 })
    .lean();

  const unmappedIssueRows = await BiometricSyncIssue.find({
    status: 'open',
    issueType: { $in: ['employee_mapping_missing', 'employee_mapping_invalid'] }
  })
    .select('etimeUserId issueType message updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  const seen = new Set();
  const unmappedIds = [];
  for (const row of unmappedIssueRows) {
    const etimeUserId = String(row.etimeUserId || '').trim();
    if (!etimeUserId || seen.has(etimeUserId)) continue;
    seen.add(etimeUserId);
    unmappedIds.push({
      etimeUserId,
      issueType: row.issueType,
      message: row.message || '',
      updatedAt: row.updatedAt || null
    });
  }

  res.status(200).json({
    success: true,
    data: {
      mappings,
      unmappedIds
    }
  });
});

// @desc    Create or update biometric employee mapping
// @route   POST /api/biometric/mappings
// @access  Private (Admin)
exports.upsertMapping = asyncHandler(async (req, res) => {
  const etimeUserId = String(req.body?.etimeUserId || '').trim();
  const employeeId = String(req.body?.employeeId || '').trim();
  const notes = String(req.body?.notes || '').trim();

  if (!etimeUserId || !employeeId) {
    return res.status(400).json({ success: false, error: 'etimeUserId and employeeId are required' });
  }

  const employee = await User.findById(employeeId).select('_id fullName employeeId email designation status').lean();
  if (!employee) {
    return res.status(404).json({ success: false, error: 'HRMS employee not found' });
  }

  const mapping = await BiometricEmployeeMapping.findOneAndUpdate(
    { etimeUserId },
    {
      $set: {
        employeeId,
        notes,
        active: true,
        validatedAt: new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .populate('employeeId', '_id fullName employeeId email designation status')
    .lean();

  await require('../models/BiometricSyncIssue').updateMany(
    { etimeUserId, status: 'open', issueType: { $in: ['employee_mapping_missing', 'employee_mapping_invalid'] } },
    { $set: { status: 'resolved', resolvedAt: new Date(), employeeId } }
  ).catch(() => {});

  res.status(200).json({ success: true, data: mapping });
});

// @desc    Delete biometric employee mapping
// @route   DELETE /api/biometric/mappings/:id
// @access  Private (Admin)
exports.deleteMapping = asyncHandler(async (req, res) => {
  const mapping = await BiometricEmployeeMapping.findByIdAndDelete(req.params.id);
  if (!mapping) {
    return res.status(404).json({ success: false, error: 'Mapping not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
