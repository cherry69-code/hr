const mongoose = require('mongoose');

const EmployeeDocumentSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  documentType: { type: String, enum: ['offer', 'agreement', 'confidentiality', 'esop', 'nda', 'payslip', 'other'], required: true },
  fileUrl: { type: String, required: true },
  sourceEsignDocumentId: { type: mongoose.Schema.ObjectId, ref: 'EsignDocument' }
}, { timestamps: true });

EmployeeDocumentSchema.index({ employeeId: 1, documentType: 1, createdAt: -1 });

module.exports = mongoose.model('EmployeeDocument', EmployeeDocumentSchema);

