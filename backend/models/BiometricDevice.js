const mongoose = require('mongoose');

const BiometricDeviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  deviceName: {
    type: String,
    required: true
  },
  deviceIp: {
    type: String,
    required: true,
    trim: true
  },
  deviceLocation: {
    type: String,
    required: true
  },
  deviceType: {
    type: String,
    enum: ['Face Recognition', 'Fingerprint', 'RFID'],
    default: 'Face Recognition'
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Maintenance'],
    default: 'Active'
  },
  lastSyncAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('BiometricDevice', BiometricDeviceSchema);
