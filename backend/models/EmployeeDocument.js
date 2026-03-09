const mongoose = require('mongoose');

const EmployeeDocumentSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  documentType: { type: String, enum: ['offer', 'agreement', 'confidentiality', 'esop', 'nda', 'payslip', 'other'], required: true },
  fileUrl: { type: String, required: true },
  month: { type: Number, min: 1, max: 12 },
  year: { type: Number },
  title: { type: String, trim: true },
  meta: mongoose.Schema.Types.Mixed,
  sourceEsignDocumentId: { type: mongoose.Schema.ObjectId, ref: 'EsignDocument' },
  sourcePayslipId: { type: mongoose.Schema.ObjectId, ref: 'Payslip' }
}, { timestamps: true });

EmployeeDocumentSchema.index({ employeeId: 1, documentType: 1, createdAt: -1 });
EmployeeDocumentSchema.index(
  { employeeId: 1, documentType: 1, year: 1, month: 1 },
  { unique: true, partialFilterExpression: { documentType: 'payslip', year: { $exists: true }, month: { $exists: true } } }
);

module.exports = mongoose.model('EmployeeDocument', EmployeeDocumentSchema);
