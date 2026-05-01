const mongoose = require('mongoose');

const BiometricSyncIssueSchema = new mongoose.Schema(
  {
    issueKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    issueType: {
      type: String,
      enum: ['employee_mapping_missing', 'employee_mapping_invalid', 'invalid_timestamp', 'sync_processing_failed'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['open', 'retrying', 'resolved'],
      default: 'open',
      index: true
    },
    etimeUserId: {
      type: String,
      trim: true,
      index: true
    },
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    punchTime: {
      type: Date
    },
    message: {
      type: String,
      trim: true
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed
    },
    retryCount: {
      type: Number,
      default: 0
    },
    lastRetriedAt: {
      type: Date
    },
    resolvedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('BiometricSyncIssue', BiometricSyncIssueSchema);
