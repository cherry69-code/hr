const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['aadhar', 'pan', 'degreeCertificate', 'photo', 'offer_letter', 'joining_letter', 'joining_agreement', 'resume', 'others'],
    required: true
  },
  url: {
    type: String,
    // url is required for uploaded documents, but not for initial esign drafts
  },
  storage: {
    provider: { type: String, enum: ['cloudinary'], default: 'cloudinary' },
    publicId: { type: String },
    resourceType: { type: String },
    format: { type: String },
    deliveryType: { type: String },
    version: { type: Number }
  },
  // --- E-Sign Fields ---
  companyId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Company' // Optional if multi-tenant
  },
  htmlContent: String,
  token: String,
  tokenExpiry: Date,
  status: {
    type: String,
    enum: ['Sent', 'EmployeeSigned', 'Completed'],
    default: 'Sent'
  },
  employeeSignature: String, // Base64
  employeeSignedAt: Date,
  employeeIP: String,
  employeeUserAgent: String,
  hrSignature: String, // Base64
  hrSignedAt: Date,
  documentHash: String,
  htmlHash: String,
  // ---------------------
  uploadedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Add indexes for performance
DocumentSchema.index({ employeeId: 1, type: 1 });
DocumentSchema.index({ 'storage.publicId': 1 });

module.exports = mongoose.model('Document', DocumentSchema);
