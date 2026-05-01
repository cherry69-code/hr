const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Location = require('../models/Location');
const { getDistance } = require('../utils/geofence');
const asyncHandler = require('../middlewares/asyncHandler');
const cloudinary = require('../config/cloudinary');

const isGeoAttendanceAllowedDay = (date) => {
  const day = new Date(date).getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  return day !== 1; // Tuesday to Sunday
};

const getApprovedLocationMatch = async ({ latitude, longitude, selectedLocationId }) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const locations = await Location.find({ active: true })
    .select('latitude longitude name radius')
    .lean();

  if (!locations.length) {
    return { error: 'No attendance locations configured.' };
  }

  let best = null;
  let matched = null;

  for (const loc of locations) {
    const distance = getDistance(lat, lng, loc.latitude, loc.longitude);
    const radius = Math.max(1, Number(loc.radius || 20));

    if (!best || distance < best.distance) {
      best = { location: loc, distance };
    }

    if (distance <= radius) {
      if (!matched || distance < matched.distance) {
        matched = { location: loc, distance };
      }
    }
  }

  if (selectedLocationId) {
    const selected = locations.find((loc) => String(loc._id) === String(selectedLocationId));
    if (selected) {
      const selectedDistance = getDistance(lat, lng, selected.latitude, selected.longitude);
      const selectedRadius = Math.max(1, Number(selected.radius || 20));
      best = { location: selected, distance: selectedDistance };
      matched = selectedDistance <= selectedRadius ? { location: selected, distance: selectedDistance } : null;
    }
  }

  return { best, matched };
};

// @desc    Mark attendance (Check-in)
// @route   POST /api/attendance/checkin/:employeeId
// @access  Private
exports.checkIn = asyncHandler(async (req, res, next) => {
  const { latitude, longitude, gpsAccuracyMeters, photoBase64, faceVerified, selectedLocationId } = req.body || {};
  const employeeId = req.params.employeeId;

  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = gpsAccuracyMeters !== undefined && gpsAccuracyMeters !== null ? Number(gpsAccuracyMeters) : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ success: false, error: 'Please provide location coordinates' });
  }

  if (acc !== null && (!Number.isFinite(acc) || acc >= 50)) {
    return res.status(400).json({ success: false, error: 'Location not accurate. Please refresh GPS and try again.' });
  }

  if (!photoBase64 || typeof photoBase64 !== 'string') {
    return res.status(400).json({ success: false, error: 'Selfie is required' });
  }

  const mimeMatch = photoBase64.match(/^data:(image\/(jpeg|jpg|png));base64,/);
  if (!mimeMatch) {
    return res.status(400).json({ success: false, error: 'Invalid selfie format. Only JPG/PNG allowed.' });
  }
  const base64Data = photoBase64.replace(/^data:.+;base64,/, '');
  const approxBytes = Math.floor(base64Data.length * 0.75);
  if (approxBytes > 3 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: 'Selfie too large (max 3MB)' });
  }

  if (faceVerified === false) {
    return res.status(400).json({ success: false, error: 'Face verification failed' });
  }

  // 1. Fetch employee
  const employee = await User.findById(employeeId).lean();

  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }

  const now = new Date();
  if (!isGeoAttendanceAllowedDay(now)) {
    return res.status(400).json({ success: false, error: 'Geo attendance is allowed only from Tuesday to Sunday' });
  }

  // Check if already checked in today (One Punch-In Policy)
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const existingAttendance = await Attendance.findOne({
    employeeId,
    date: { $gte: startOfDay }
  });

  if (existingAttendance) {
    return res.status(400).json({ success: false, error: 'You have already checked in today.' });
  }

  const locationResult = await getApprovedLocationMatch({ latitude: lat, longitude: lng, selectedLocationId });
  if (locationResult.error) {
    return res.status(400).json({ success: false, error: locationResult.error });
  }
  const { best, matched } = locationResult;
  const locationValidated = Boolean(matched);
  if (!locationValidated) {
    // New policy: Off-site or any check-in allowed ONLY within 100m of approved locations
    return res.status(400).json({
      success: false,
      error: `Check-in allowed only at approved locations. You are ${Math.round(best.distance)}m from nearest (${best.location.name}).`
    });
  }

  // 3. Status Logic (Half Day vs Present)
  // Max Login Time: 10:00 AM
  const loginThreshold = new Date();
  loginThreshold.setHours(10, 0, 0, 0);

  let status = 'Present';
  const lateFlag = now.getTime() > loginThreshold.getTime();
  const lateMinutes = lateFlag ? Math.floor((now.getTime() - loginThreshold.getTime()) / (1000 * 60)) : 0;
  if (lateFlag) status = 'Half Day';

  let photoUrl = '';
  try {
    const uploaded = await cloudinary.uploader.upload(photoBase64, {
      folder: 'attendance/office',
      resource_type: 'image',
      type: 'private',
      public_id: `${employee.employeeId || employee._id}_${Date.now()}`
    });
    photoUrl = uploaded.secure_url || '';
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Selfie upload failed' });
  }

  // 4. Create Attendance Record
  const attendance = await Attendance.create({
    employeeId: employee._id,
    date: now,
    checkInTime: now,
    workingMinutes: 0,
    lateMinutes,
    lateFlag,
    latitude: lat,
    longitude: lng,
    gpsAccuracyMeters: acc !== null ? acc : undefined,
    locationId: matched.location._id,
    locationName: matched.location.name,
    status,
    locationValidated,
    insideRadius: locationValidated,
    photoUrl,
    faceVerified: faceVerified !== undefined ? Boolean(faceVerified) : true,
    source: 'OFFICE_FACE_WEB'
  });

  res.status(201).json({ success: true, data: attendance });
});

// @desc    Mark attendance (Check-out)
// @route   PUT /api/attendance/checkout/:employeeId
// @access  Private
exports.checkOut = asyncHandler(async (req, res, next) => {
  const employeeId = req.params.employeeId;
  const { latitude, longitude, gpsAccuracyMeters, selectedLocationId } = req.body || {};
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = gpsAccuracyMeters !== undefined && gpsAccuracyMeters !== null ? Number(gpsAccuracyMeters) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!isGeoAttendanceAllowedDay(today)) {
    return res.status(400).json({ success: false, error: 'Geo attendance is allowed only from Tuesday to Sunday' });
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ success: false, error: 'Please provide location coordinates for check-out' });
  }

  if (acc !== null && (!Number.isFinite(acc) || acc >= 50)) {
    return res.status(400).json({ success: false, error: 'Location not accurate. Please refresh GPS and try again.' });
  }

  // Find attendance for today (even if already checked out)
  const attendance = await Attendance.findOne({
    employeeId,
    date: { $gte: today }
  });

  if (!attendance) {
    return res.status(404).json({ success: false, error: 'No active check-in found for today' });
  }

  const locationResult = await getApprovedLocationMatch({ latitude: lat, longitude: lng, selectedLocationId });
  if (locationResult.error) {
    return res.status(400).json({ success: false, error: locationResult.error });
  }
  const { best, matched } = locationResult;
  if (!matched) {
    return res.status(400).json({
      success: false,
      error: `Check-out allowed only at approved locations. You are ${Math.round(best.distance)}m from nearest (${best.location.name}).`
    });
  }

  // Always update to the LATEST check-out time
  const checkOutTime = new Date();
  attendance.checkOutTime = checkOutTime;
  attendance.checkOutLatitude = lat;
  attendance.checkOutLongitude = lng;
  attendance.locationValidated = true;
  attendance.insideRadius = true;
  attendance.locationId = matched.location._id;
  attendance.locationName = matched.location.name;
  
  // Calculate Duration
  const durationMs = checkOutTime - new Date(attendance.checkInTime);

  const loginThreshold = new Date(attendance.date);
  loginThreshold.setHours(10, 0, 0, 0);
  const checkInTime = new Date(attendance.checkInTime);

  const lateFlag = checkInTime.getTime() > loginThreshold.getTime();
  const lateMinutes = lateFlag ? Math.floor((checkInTime.getTime() - loginThreshold.getTime()) / (1000 * 60)) : 0;

  const workingMinutes = Math.max(0, Math.floor(durationMs / (1000 * 60)));
  const shiftEnd = new Date(attendance.date);
  shiftEnd.setHours(19, 0, 0, 0);
  const earlyExitMinutes = Math.max(0, Math.floor((shiftEnd.getTime() - checkOutTime.getTime()) / (1000 * 60)));

  attendance.workingMinutes = workingMinutes;
  attendance.lateFlag = lateFlag;
  attendance.lateMinutes = lateMinutes;
  attendance.earlyExitMinutes = earlyExitMinutes;

  if (attendance.status !== 'Weekly Off Work') {
    if (lateFlag) {
      attendance.status = 'Half Day';
    } else if (workingMinutes < 360) {
      attendance.status = 'Half Day';
    } else {
      attendance.status = 'Present';
    }
  }

  await attendance.save();

  res.status(200).json({ success: true, data: attendance });
});

// @desc    Get team attendance summary (Today's Status)
// @route   GET /api/attendance/summary/team
// @access  Private
exports.getTeamSummary = asyncHandler(async (req, res, next) => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const isAdmin = req.user.role === 'admin';
  const isHr = req.user.role === 'hr';
  const isManagerLevel = req.user.role === 'manager' || ['N1', 'N2', 'N3', 'PnL'].includes(String(req.user.level || ''));

  const getHierarchyIds = async (rootId) => {
    const rows = await User.aggregate([
      { $match: { _id: rootId } },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'reportingManagerId',
          as: 'desc'
        }
      },
      { $project: { ids: { $concatArrays: [['$_id'], '$desc._id'] } } }
    ]);
    return rows[0]?.ids || [rootId];
  };

  let query = { role: { $ne: 'admin' } };

  if (!isAdmin && !isHr) {
    if (isManagerLevel) {
      const ids = await getHierarchyIds(req.user._id);
      query._id = { $in: ids };
    } else if (req.user.teamId) {
      query.teamId = req.user.teamId;
    } else {
      query._id = req.user._id;
    }
  }

  // Get employees (scoped)
  const employees = await User.find(query)
    .select('fullName role profilePicture')
    .limit(100) // Safety limit
    .lean();

  if (!employees.length) {
    return res.status(200).json({ success: true, data: [] });
  }

  const employeeIds = employees.map(e => e._id);

  // Get today's attendance for these employees only
  const attendanceToday = await Attendance.find({
    date: { $gte: startOfDay, $lte: endOfDay },
    employeeId: { $in: employeeIds }
  })
  .select('employeeId status')
  .lean();

  // Create Map for O(1) lookup
  const attendanceMap = new Map();
  attendanceToday.forEach(record => {
    attendanceMap.set(record.employeeId.toString(), record);
  });

  const teamData = employees.map(emp => {
    const record = attendanceMap.get(emp._id.toString());
    
    let status = 'absent';
    if (record) {
      status = record.status ? record.status.toLowerCase() : 'present';
    }

    return {
      name: emp.fullName,
      role: emp.role || 'Employee',
      avatar: emp.profilePicture,
      status: status
    };
  });

  res.status(200).json({ success: true, data: teamData });
});

// @desc    Get employee attendance
// @route   GET /api/attendance/:employeeId
// @access  Private
exports.getAttendance = asyncHandler(async (req, res, next) => {
  const attendance = await Attendance.find({ employeeId: req.params.employeeId }).sort('-date').lean();
  res.status(200).json({ success: true, count: attendance.length, data: attendance });
});
