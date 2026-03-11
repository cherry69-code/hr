const mongoose = require('mongoose');

const SystemAuditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.ObjectId, ref: 'User', index: true },
    actorRole: { type: String, index: true },
    action: { type: String, required: true, index: true },
    method: { type: String },
    path: { type: String, index: true },
    statusCode: { type: Number, index: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    targetId: { type: String },
    meta: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

SystemAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SystemAuditLog', SystemAuditLogSchema);
