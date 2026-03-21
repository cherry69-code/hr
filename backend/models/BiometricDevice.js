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
  devicePort: {
    type: Number,
    default: 4370
  },
  etimeSensorId: {
    type: String,
    trim: true
  },
  deviceLocation: {
    type: String,
    required: true
  },
  locationId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Location'
  },
  deviceType: {
    type: String,
    enum: ['Face Recognition', 'Fingerprint', 'RFID'],
    default: 'Face Recognition'
  },
  cloudPushEnabled: {
    type: Boolean,
    default: true
  },
  lanPullEnabled: {
    type: Boolean,
    default: false
  },
  apiTokenHash: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Maintenance'],
    default: 'Active'
  },
  lastSyncAt: {
    type: Date
  },
  lastLanSyncAt: {
    type: Date
  },
  lastLanPunchAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('BiometricDevice', BiometricDeviceSchema);
