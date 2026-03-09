const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Location = require('../models/Location');
const { getDistance } = require('../utils/geofence');
const asyncHandler = require('../middlewares/asyncHandler');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// @desc    Mark attendance (Check-in)
// @route   POST /api/attendance/checkin/:employeeId
// @access  Private
exports.checkIn = asyncHandler(async (req, res, next) => {
  const { latitude, longitude, offsiteReason, photoBase64, selectedLocationId } = req.body;
  const employeeId = req.params.employeeId;

  if (!latitude || !longitude) {
    return res.status(400).json({ success: false, error: 'Please provide location coordinates' });
  }

  // 1. Fetch employee
  const employee = await User.findById(employeeId).lean();

  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }

  // 2. Validate against configured locations
  const locations = await Location.find({ active: true })
    .select('latitude longitude name radius')
    .lean();
    
  if (!locations.length) {
    return res.status(400).json({ success: false, error: 'No attendance locations configured.' });
  }

  // Find NEAREST active location (Multi-location support)
  // Instead of checking against a specific assigned geofence, we check against ALL active locations.
  // If user is within range of ANY active location, check-in is valid.
  
  let best = null;
  let withinRangeOfAny = false;
  let validLocation = null;

  const STRICT_RADIUS = 20; // Enforced radius
  for (const loc of locations) {
    const distance = getDistance(latitude, longitude, loc.latitude, loc.longitude);
    const radius = STRICT_RADIUS;
    
    if (distance <= radius) {
      withinRangeOfAny = true;
      validLocation = loc;
      best = { location: loc, distance }; // Found a valid one, we can break or keep looking for closer? 
      // Usually first match is enough or closest match. Let's find closest match anyway for reporting.
    }

    if (!best || distance < best.distance) {
      best = { location: loc, distance };
    }
  }

  const allowedRadius = STRICT_RADIUS;
  const day = new Date().getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  
  // Tuesday (2) to Friday (5) -> Remote Allowed
  // Saturday (6), Sunday (0) -> On-Site Required
  // Monday (1) -> Weekly Off
  const isRemoteAllowed = [2, 3, 4, 5].includes(day);
  const isWeeklyOff = day === 1;

  let locationValidated = false;
  const isOnSiteRequired = [0, 6].includes(day); 

  // If HR explicitly selected a location for off-site mapping, honor it
  let overrideLocation = null;
  if (selectedLocationId) {
    overrideLocation = locations.find(l => String(l._id) === String(selectedLocationId)) || null;
    if (overrideLocation) {
      best = { location: overrideLocation, distance: getDistance(latitude, longitude, overrideLocation.latitude, overrideLocation.longitude) };
    }
  }

  if (withinRangeOfAny) {
    locationValidated = true; // Within range of at least one office
  } else {
    // New policy: Off-site or any check-in allowed ONLY within 20m of approved locations
    return res.status(400).json({
      success: false,
      error: `Check-in Failed: Allowed only within 20m of approved locations. You are ${Math.round(best.distance)}m from nearest (${best.location.name}).`
    });
  }
  
  // If remote allowed (Tue-Fri) OR it's Monday -> Proceed.

  // 3. Status Logic (Half Day vs Present)
  // Max Login Time: 10:00 AM
  const now = new Date();
  const loginThreshold = new Date();
  loginThreshold.setHours(10, 0, 0, 0);

  let status = 'Present';
  if (now > loginThreshold) {
    status = 'Half Day';
  }
  if (isWeeklyOff) {
    status = 'Weekly Off Work'; // Or keep 'Present' / 'Overtime'
  }

  // Optional selfie upload when offsite
  let photoUrl = '';
  if (!locationValidated && offsiteReason && photoBase64) {
    try {
      const uploaded = await cloudinary.uploader.upload(photoBase64, {
        folder: 'attendance/selfies',
        resource_type: 'image'
      });
      photoUrl = uploaded.secure_url;
    } catch (e) {
      // continue without photo
    }
  }

  // 4. Create Attendance Record
  const attendance = await Attendance.create({
    employeeId: employee._id,
    date: now,
    checkInTime: now,
    latitude,
    longitude,
    locationId: best.location._id, // Store nearest or explicitly selected location
    locationName: locationValidated ? best.location.name : `Remote (Nearest: ${best.location.name})`,
    status,
    locationValidated,
    insideRadius: locationValidated,
    offsiteReason: offsiteReason || '',
    photoUrl
  });

  res.status(201).json({ success: true, data: attendance });
});

// @desc    Mark attendance (Check-out)
// @route   PUT /api/attendance/checkout/:employeeId
// @access  Private
exports.checkOut = asyncHandler(async (req, res, next) => {
  const employeeId = req.params.employeeId;
  const { latitude, longitude } = req.body || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const attendance = await Attendance.findOne({
    employeeId,
    date: { $gte: today },
    checkOutTime: { $exists: false }
  });

  if (!attendance) {
    return res.status(404).json({ success: false, error: 'No active check-in found for today' });
  }

  const checkOutTime = new Date();
  attendance.checkOutTime = checkOutTime;
  if (latitude && longitude) {
    attendance.checkOutLatitude = latitude;
    attendance.checkOutLongitude = longitude;
  }
  
  // Calculate Duration
  const durationMs = checkOutTime - new Date(attendance.checkInTime);
  const durationHours = durationMs / (1000 * 60 * 60);

  // Check Half-Day Logic for Checkout
  // Condition 1: Login > 10:00 AM (Already handled in Check-in)
  // Condition 2: Logout < 7:00 PM (19:00)
  // Condition 3: Total duration < 9 hours (optional check, usually implied by times)
  
  const logoutThreshold = new Date();
  logoutThreshold.setHours(19, 0, 0, 0); // 7 PM

  // If already Half Day (due to late login), keep it.
  // Else if logout is early (< 7 PM), mark as Half Day.
  if (attendance.status !== 'Half Day' && attendance.status !== 'Weekly Off Work') {
    if (checkOutTime < logoutThreshold) {
      attendance.status = 'Half Day';
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

  let query = { role: { $ne: 'admin' } };
  
  // Optimization: If user belongs to a team, only show team members
  if (req.user.teamId) {
    query.teamId = req.user.teamId;
  } else if (req.user.role !== 'hr') {
    // If not HR and no team, limit to department or just show self/peers?
    // For now, let's limit to 50 to avoid performance issues
    // query.departmentId = req.user.departmentId; // Optional: filter by department
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
  .select('employeeId status checkInTime')
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
      // Simple late logic: if checkIn > 10:00 AM (updated policy)
      const checkIn = new Date(record.checkInTime);
      if (checkIn.getHours() >= 10 && checkIn.getMinutes() > 0) {
        status = 'late';
      }
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
