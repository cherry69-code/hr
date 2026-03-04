const AuditLog = require('../models/AuditLog');

exports.add = (data) => AuditLog.create(data);

exports.listByDocumentId = (documentId) => AuditLog.find({ documentId }).sort({ timestamp: -1 }).lean();

