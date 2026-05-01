const mongoose = require('mongoose');

const SyncMetaSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  lastSyncedTime: {
    type: Date
  },
  lastRunAt: {
    type: Date
  },
  lastRunStatus: {
    type: String,
    enum: ['ok', 'error'],
    default: 'ok'
  },
  lastRunMessage: {
    type: String,
    trim: true
  },
  lastReport: {
    type: mongoose.Schema.Types.Mixed
  }
});

module.exports = mongoose.model('SyncMeta', SyncMetaSchema);
