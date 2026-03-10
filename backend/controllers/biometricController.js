const BiometricDevice = require('../models/BiometricDevice');
const BiometricLog = require('../models/BiometricLog');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
// @route   POST /api/biometric/punch
// @access  Public (Secured by IP Whitelist Middleware)
exports.processPunch = asyncHandler(async (req, res, next) => {
  const { employee_code, device_id, punch_time, punch_type, source, image_base64 } = req.body;

  if (!employee_code || !punch_time) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // 1. Upload Photo if provided (Anti-Proxy)
  let imageUrl = '';
  if (image_base64) {
    try {
      const result = await cloudinary.uploader.upload(image_base64, {
        folder: 'attendance/biometric',
        public_id: `${employee_code}_${Date.now()}`
      });
      imageUrl = result.secure_url;
    } catch (err) {
      console.error('Biometric Image Upload Failed:', err.message);
    }
  }

  // 2. Log Raw Punch
  const log = await BiometricLog.create({
    employeeCode: employee_code,
    deviceId: device_id || 'UNKNOWN',
    punchTime: punch_time,
    punchType: punch_type || 'IN', // Usually device sends check-in/out or just '0'/'1'
    source: source || 'BIOMETRIC',
    imageUrl,
    processed: false
  });

  // 3. Process Attendance Logic (Sync immediately or async?)
  // We'll process immediately for real-time updates.
  
  // Find Employee
  const employee = await User.findOne({ employeeId: employee_code });
  if (!employee) {
    // Log exists but user not found (maybe not synced yet)
    return res.status(200).json({ success: true, message: 'Log received. Employee not found.', logId: log._id });
  }

  const punchDate = new Date(punch_time);
  const startOfDay = new Date(punchDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(punchDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Find existing attendance for the day
  let attendance = await Attendance.findOne({
    employeeId: employee._id,
    date: { $gte: startOfDay, $lte: endOfDay }
  });

  if (!attendance) {
    // --- FIRST PUNCH (CHECK-IN) ---
    
    // Status Logic
    // Max Login Time: 10:00 AM
    const loginThreshold = new Date(startOfDay);
    loginThreshold.setHours(10, 0, 0, 0);
    
    let status = 'Present';
    if (punchDate > loginThreshold) {
      status = 'Half Day'; // Late coming
    }
    
    // Check Weekly Off
    const day = punchDate.getDay();
    if (day === 1) { // Monday Off
        status = 'Weekly Off Work'; // Worked on off day
    }

    attendance = await Attendance.create({
      employeeId: employee._id,
      date: startOfDay, // Normalize to midnight for query consistency
      checkInTime: punchDate,
      source: 'BIOMETRIC',
      deviceId: device_id,
      status: status,
      locationName: 'Office (Biometric)',
      locationValidated: true,
      insideRadius: true,
      photoUrl: imageUrl // Store first punch photo
    });

  } else {
    // --- SUBSEQUENT PUNCH (UPDATE CHECK-OUT) ---
    
    // Logic: Always update check-out to the LATEST punch time of the day
    // This handles multiple IN/OUTs (lunch, breaks). The last punch is the final out.
    
    if (punchDate > new Date(attendance.checkInTime)) {
        attendance.checkOutTime = punchDate;
        
        // Update checkout location/device info if needed?
        // attendance.checkOutDeviceId = device_id; 
        
        // Recalculate Status if needed (e.g. was Half Day, now worked enough? Or reverse?)
        // For now, keep existing status unless explicit override logic needed.
        
        // Check Half-Day Logic for Checkout (Early Exit)
        const logoutThreshold = new Date(startOfDay);
        logoutThreshold.setHours(19, 0, 0, 0); // 7 PM
        
        // Only downgrade to Half Day if not already Weekly Off
        if (attendance.status !== 'Weekly Off Work') {
            const isLateLogin = attendance.status === 'Half Day' || (new Date(attendance.checkInTime) > loginThreshold);
            
            if (isLateLogin) {
                attendance.status = 'Half Day';
            } else if (punchDate < logoutThreshold) {
                 // Early exit < 7 PM
                 attendance.status = 'Half Day';
            } else {
                 // On time login & On time logout
                 attendance.status = 'Present';
            }
        }
        
        await attendance.save();
    }
  }

  // Mark log as processed
  log.processed = true;
  log.processedAt = Date.now();
  await log.save();

  // Update Device Last Sync
  await BiometricDevice.findOneAndUpdate({ deviceId: device_id }, { lastSyncAt: Date.now() });

  res.status(200).json({ success: true, message: 'Punch processed successfully' });
});

// @desc    Get Biometric Logs
// @route   GET /api/biometric/logs
// @access  Private (Admin)
exports.getLogs = asyncHandler(async (req, res, next) => {
  let query = {};
  if (req.query.employeeCode) {
    query.employeeCode = req.query.employeeCode;
  }
  if (req.query.date) {
    const d = new Date(req.query.date);
    const start = new Date(d.setHours(0,0,0,0));
    const end = new Date(d.setHours(23,59,59,999));
    query.punchTime = { $gte: start, $lte: end };
  }

  const logs = await BiometricLog.find(query).sort('-punchTime').limit(100);
  res.status(200).json({ success: true, count: logs.length, data: logs });
});
