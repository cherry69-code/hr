const mongoose = require('mongoose');

const FieldAttendanceLogSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  employeeCode: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  checkType: {
    type: String,
    enum: ['CHECK_IN', 'CHECK_OUT'],
    required: true
  },
  punchTime: {
    type: Date,
    required: true,
    index: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  gpsAccuracyMeters: {
    type: Number
  },
  locationAddress: {
    type: String,
    trim: true
  },
  faceVerified: {
    type: Boolean,
    default: false
  },
  faceSimilarity: {
    type: Number
  },
  livenessVerified: {
    type: Boolean,
    default: false
  },
  imageUrl: {
    type: String,
    trim: true
  },
  imagePublicId: {
    type: String,
    trim: true,
    index: true
  },
  deviceType: {
    type: String,
    default: 'mobile',
    trim: true
  },
  source: {
    type: String,
    default: 'FIELD_FACE_GPS',
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

FieldAttendanceLogSchema.index({ employeeId: 1, punchTime: -1 });
FieldAttendanceLogSchema.index({ employeeCode: 1, punchTime: -1 });

module.exports = mongoose.model('FieldAttendanceLog', FieldAttendanceLogSchema);
