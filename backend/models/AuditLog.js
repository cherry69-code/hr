const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.ObjectId, ref: 'EsignDocument', required: true },
  action: { type: String, required: true },
  performedBy: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  ipAddress: String,
  meta: mongoose.Schema.Types.Mixed
});

AuditLogSchema.index({ documentId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

