const mongoose = require('mongoose');

const BiometricLogSchema = new mongoose.Schema({
  uniqueKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  employeeCode: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  deviceId: {
    type: String,
    required: true,
    ref: 'BiometricDevice'
  },
  punchTime: {
    type: Date,
    required: true,
    index: true
  },
  punchType: {
    type: String,
    enum: ['IN', 'OUT', 'BREAK_IN', 'BREAK_OUT', 'CHECK_IN', 'CHECK_OUT'],
    default: 'IN'
  },
  verificationType: {
    type: String,
    enum: ['face', 'fingerprint', 'rfid', 'password', 'unknown'],
    default: 'unknown'
  },
  source: {
    type: String,
    default: 'BIOMETRIC'
  },
  imageUrl: {
    type: String,
    trim: true
  },
  rawPayload: {
    type: mongoose.Schema.Types.Mixed
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  processed: {
    type: Boolean,
    default: false
  },
  processedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for query efficiency
BiometricLogSchema.index({ punchTime: -1 });
BiometricLogSchema.index({ employeeCode: 1, punchTime: -1 });
BiometricLogSchema.index({ deviceId: 1, punchTime: -1 });

module.exports = mongoose.model('BiometricLog', BiometricLogSchema);
