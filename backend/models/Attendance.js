const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkInTime: Date,
  checkOutTime: Date,
  workingMinutes: Number,
  lateMinutes: Number,
  lateFlag: {
    type: Boolean,
    default: false
  },
  earlyExitMinutes: Number,
  missedPunch: {
    type: Boolean,
    default: false
  },
  missedPunchNotifiedAt: Date,
  latitude: Number, // legacy: check-in latitude
  longitude: Number, // legacy: check-in longitude
  gpsAccuracyMeters: Number,
  checkOutLatitude: Number,
  checkOutLongitude: Number,
  locationId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Location'
  },
  locationName: String,
  locationValidated: {
    type: Boolean,
    default: false
  },
  insideRadius: {
    type: Boolean,
    default: false
  },
  offsiteReason: {
    type: String,
    trim: true
  },
  photoUrl: {
    type: String,
    trim: true
  },
  faceVerified: {
    type: Boolean,
    default: false
  },
  source: {
    type: String,
    enum: ['BIOMETRIC', 'MOBILE_GPS', 'MANUAL_ADMIN', 'OFFICE_FACE_WEB', 'FIELD_FACE_GPS', 'ADMIN_OVERRIDE'],
    default: 'MOBILE_GPS'
  },
  deviceId: {
    type: String, // Biometric Device ID
    trim: true
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Half Day', 'Late', 'LOP', 'Weekly Off Work', 'Missed Punch'],
    default: 'Absent'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for performance
AttendanceSchema.index({ employeeId: 1, date: -1 });
AttendanceSchema.index({ date: -1 });
AttendanceSchema.index({ locationId: 1 });
AttendanceSchema.index({ status: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
