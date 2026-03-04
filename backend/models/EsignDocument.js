const mongoose = require('mongoose');

const SignatureSchema = new mongoose.Schema({
  image: String,
  ipAddress: String,
  signedAt: Date
}, { _id: false });

const EsignDocumentSchema = new mongoose.Schema({
  companyId: { type: String, default: 'propninja' },
  employeeId: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  documentType: { type: String, enum: ['offer', 'agreement', 'confidentiality', 'esop', 'nda'], required: true },
  templateId: { type: mongoose.Schema.ObjectId, ref: 'DocumentTemplate' },
  htmlContent: { type: String, required: true },
  status: { type: String, enum: ['draft', 'sent', 'employee_signed', 'completed', 'expired'], default: 'draft' },
  tokenHash: { type: String, required: true, unique: true },
  tokenExpiresAt: { type: Date, required: true },
  sentAt: Date,
  signedAt: Date,
  hrSigned: { type: Boolean, default: false },
  employeeSigned: { type: Boolean, default: false },
  employeeIP: String,
  employeeUserAgent: String,
  documentHash: String,
  employeeSignature: { type: SignatureSchema, default: null },
  hrSignature: { type: SignatureSchema, default: null },
  finalPdfPath: String
}, { timestamps: true });

EsignDocumentSchema.index({ employeeId: 1, documentType: 1, status: 1 });
EsignDocumentSchema.index({ tokenExpiresAt: 1 });

module.exports = mongoose.model('EsignDocument', EsignDocumentSchema);

