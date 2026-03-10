const mongoose = require('mongoose');

const BiometricLogSchema = new mongoose.Schema({
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
  source: {
    type: String,
    default: 'BIOMETRIC'
  },
  imageUrl: {
    type: String,
    trim: true
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

module.exports = mongoose.model('BiometricLog', BiometricLogSchema);
