const BiometricDevice = require('../models/BiometricDevice');
const BiometricEmployeeMapping = require('../models/BiometricEmployeeMapping');
const BiometricLog = require('../models/BiometricLog');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const cloudinary = require('../config/cloudinary');
const crypto = require('crypto');
const { upsertAttendanceFromPunches } = require('../services/attendanceEngine');

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

  const token =
    String(req.headers['x-biometric-token'] || '').trim() ||
    String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const device = await BiometricDevice.findOne({ deviceId }).lean();
  if (!device) {
    return res.status(403).json({ success: false, error: 'Invalid device_id' });
  }
  if (device.apiTokenHash) {
    if (!token) return res.status(403).json({ success: false, error: 'Missing device token' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== device.apiTokenHash) {
      return res.status(403).json({ success: false, error: 'Invalid device token' });
    }
  }

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
        punchType: String(punch_type || 'IN').toUpperCase(),
        verificationType: String(verification_type || 'unknown').toLowerCase(),
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
  const startOfDay = new Date(punchDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(punchDate);
  endOfDay.setHours(23, 59, 59, 999);

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
