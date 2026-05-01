const Attendance = require('../models/Attendance');
const FieldAttendanceLog = require('../models/FieldAttendanceLog');
const asyncHandler = require('../middlewares/asyncHandler');
const cloudinary = require('../config/cloudinary');

const CHECK_IN_CUTOFF_HOUR = 10;
const CHECK_OUT_CUTOFF_HOUR = 18;
const CHECK_OUT_CUTOFF_MINUTE = 30;

const isWeekend = (d) => {
  const day = d.getDay();
  return day === 0 || day === 6;
};

const getStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const getEndOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const toNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const uploadSelfie = async (employeeCode, imageBase64) => {
  if (!imageBase64) return { url: '', publicId: '' };
  const result = await cloudinary.uploader.upload(imageBase64, {
    folder: 'attendance/field',
    resource_type: 'image',
    type: 'private',
    public_id: `${employeeCode}_${Date.now()}`
  });
  return {
    url: result?.secure_url || '',
    publicId: result?.public_id || ''
  };
};

const validateFace = ({ faceVerified, faceSimilarity, livenessVerified }) => {
  const fv = Boolean(faceVerified);
  const lv = Boolean(livenessVerified);
  const fs = typeof faceSimilarity === 'number' ? faceSimilarity : Number(faceSimilarity);
  if (!fv) return { ok: false, error: 'Face verification failed' };
  if (!lv) return { ok: false, error: 'Liveness verification failed' };
  if (!Number.isFinite(fs) || fs < 0.85) return { ok: false, error: 'Face similarity is too low' };
  return { ok: true, similarity: fs };
};

const validateGps = ({ latitude, longitude, gpsAccuracyMeters }) => {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  const acc = toNumber(gpsAccuracyMeters);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'GPS location is required' };
  }
  if (!Number.isFinite(acc) || acc >= 50) {
    return { ok: false, error: 'Location not accurate. Please enable GPS.' };
  }
  return { ok: true, lat, lng, acc };
};

const computeStatus = (checkInTime) => {
  const threshold = new Date(checkInTime);
  threshold.setHours(CHECK_IN_CUTOFF_HOUR, 0, 0, 0);
  return new Date(checkInTime).getTime() > threshold.getTime() ? 'Half Day' : 'Present';
};

exports.fieldCheckIn = asyncHandler(async (req, res) => {
  const employeeId = req.user._id;
  const employeeCode = req.user.employeeId;

  const now = new Date();
  if (!isWeekend(now)) {
    return res.status(400).json({ success: false, error: 'Field attendance is enabled only on Saturday & Sunday' });
  }

  const { latitude, longitude, gpsAccuracyMeters, locationAddress, imageBase64, faceVerified, faceSimilarity, livenessVerified, deviceType } =
    req.body || {};

  const gps = validateGps({ latitude, longitude, gpsAccuracyMeters });
  if (!gps.ok) return res.status(400).json({ success: false, error: gps.error });

  if (!imageBase64) {
    return res.status(400).json({ success: false, error: 'Selfie is required' });
  }

  const face = validateFace({ faceVerified, faceSimilarity, livenessVerified });
  if (!face.ok) return res.status(400).json({ success: false, error: face.error });

  const start = getStartOfDay(now);
  const end = getEndOfDay(now);

  const existing = await Attendance.findOne({ employeeId, date: { $gte: start, $lte: end } });
  if (existing) {
    return res.status(400).json({ success: false, error: 'You have already checked in today.' });
  }

  const selfie = await uploadSelfie(employeeCode, imageBase64);

  const attendance = await Attendance.create({
    employeeId,
    date: start,
    checkInTime: now,
    latitude: gps.lat,
    longitude: gps.lng,
    locationName: locationAddress || 'Field',
    locationValidated: true,
    insideRadius: true,
    photoUrl: selfie.url,
    photoPublicId: selfie.publicId,
    source: 'FIELD_FACE_GPS',
    status: computeStatus(now)
  });

  await FieldAttendanceLog.create({
    employeeId,
    employeeCode,
    checkType: 'CHECK_IN',
    punchTime: now,
    latitude: gps.lat,
    longitude: gps.lng,
    gpsAccuracyMeters: gps.acc,
    locationAddress: locationAddress || '',
    faceVerified: true,
    faceSimilarity: face.similarity,
    livenessVerified: true,
    imageUrl: selfie.url,
    imagePublicId: selfie.publicId,
    deviceType: deviceType || 'mobile',
    source: 'FIELD_FACE_GPS'
  });

  return res.status(201).json({ success: true, data: attendance });
});

exports.fieldCheckOut = asyncHandler(async (req, res) => {
  const employeeId = req.user._id;
  const employeeCode = req.user.employeeId;

  const now = new Date();
  if (!isWeekend(now)) {
    return res.status(400).json({ success: false, error: 'Field attendance is enabled only on Saturday & Sunday' });
  }

  const { latitude, longitude, gpsAccuracyMeters, locationAddress, imageBase64, faceVerified, faceSimilarity, livenessVerified, deviceType } =
    req.body || {};

  const gps = validateGps({ latitude, longitude, gpsAccuracyMeters });
  if (!gps.ok) return res.status(400).json({ success: false, error: gps.error });

  if (!imageBase64) {
    return res.status(400).json({ success: false, error: 'Selfie is required' });
  }

  const face = validateFace({ faceVerified, faceSimilarity, livenessVerified });
  if (!face.ok) return res.status(400).json({ success: false, error: face.error });

  const start = getStartOfDay(now);
  const end = getEndOfDay(now);

  const attendance = await Attendance.findOne({ employeeId, date: { $gte: start, $lte: end } });
  if (!attendance) {
    return res.status(404).json({ success: false, error: 'No check-in found for today' });
  }

  const checkInTime = attendance.checkInTime ? new Date(attendance.checkInTime) : null;
  if (!checkInTime || Number.isNaN(checkInTime.getTime())) {
    return res.status(400).json({ success: false, error: 'Invalid check-in time' });
  }

  const durationMs = now.getTime() - checkInTime.getTime();
  if (durationMs < 0) {
    return res.status(400).json({ success: false, error: 'Invalid punch time' });
  }

  const hours = durationMs / (1000 * 60 * 60);
  const dist = getDistanceMeters(gps.lat, gps.lng, Number(attendance.latitude || gps.lat), Number(attendance.longitude || gps.lng));
  if (hours >= 8 && dist < 10) {
    return res.status(400).json({ success: false, error: 'GPS location unchanged for long duration. Please refresh GPS and try again.' });
  }

  const selfie = await uploadSelfie(employeeCode, imageBase64);

  const currentOut = attendance.checkOutTime ? new Date(attendance.checkOutTime) : null;
  if (!currentOut || Number.isNaN(currentOut.getTime()) || now > currentOut) {
    attendance.checkOutTime = now;
    attendance.checkOutLatitude = gps.lat;
    attendance.checkOutLongitude = gps.lng;
  }

  attendance.locationName = locationAddress || attendance.locationName || 'Field';
  attendance.source = 'FIELD_FACE_GPS';
  const lateThreshold = new Date(checkInTime);
  lateThreshold.setHours(CHECK_IN_CUTOFF_HOUR, 0, 0, 0);
  const outThreshold = new Date(checkInTime);
  outThreshold.setHours(CHECK_OUT_CUTOFF_HOUR, CHECK_OUT_CUTOFF_MINUTE, 0, 0);
  attendance.lateFlag = checkInTime.getTime() > lateThreshold.getTime();
  attendance.lateMinutes = attendance.lateFlag ? Math.floor((checkInTime.getTime() - lateThreshold.getTime()) / (1000 * 60)) : 0;
  attendance.earlyExitMinutes = Math.max(0, Math.floor((outThreshold.getTime() - now.getTime()) / (1000 * 60)));
  attendance.workingMinutes = Math.max(0, Math.floor(durationMs / (1000 * 60)));
  attendance.status = !attendance.lateFlag && now.getTime() >= outThreshold.getTime() ? 'Present' : 'Half Day';
  await attendance.save();

  await FieldAttendanceLog.create({
    employeeId,
    employeeCode,
    checkType: 'CHECK_OUT',
    punchTime: now,
    latitude: gps.lat,
    longitude: gps.lng,
    gpsAccuracyMeters: gps.acc,
    locationAddress: locationAddress || '',
    faceVerified: true,
    faceSimilarity: face.similarity,
    livenessVerified: true,
    imageUrl: selfie.url,
    imagePublicId: selfie.publicId,
    deviceType: deviceType || 'mobile',
    source: 'FIELD_FACE_GPS'
  });

  return res.status(200).json({ success: true, data: attendance });
});

exports.getFieldLogs = asyncHandler(async (req, res) => {
  const { date } = req.query || {};
  let start = null;
  let end = null;
  if (date) {
    const d = new Date(String(date));
    if (!Number.isNaN(d.getTime())) {
      start = getStartOfDay(d);
      end = getEndOfDay(d);
    }
  }

  const query = {};
  if (start && end) {
    query.punchTime = { $gte: start, $lte: end };
  }
  if (req.query?.employeeCode) {
    query.employeeCode = String(req.query.employeeCode).trim();
  }

  const logs = await FieldAttendanceLog.find(query)
    .populate('employeeId', 'fullName employeeId')
    .sort('-punchTime')
    .limit(500)
    .lean();

  const data = logs.map((l) => ({
    ...l,
    mapUrl: l.latitude && l.longitude ? `https://maps.google.com/?q=${l.latitude},${l.longitude}` : ''
  }));

  return res.status(200).json({ success: true, count: data.length, data });
});
