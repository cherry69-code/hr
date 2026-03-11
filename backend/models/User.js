const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    unique: true
  },
  fullName: {
    type: String,
    required: [true, 'Please add a name']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  officialEmail: {
    type: String,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid official email'
    ]
  },
  personalEmail: {
    type: String,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid personal email'
    ]
  },
  profilePicture: {
    type: String,
    trim: true
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['employee', 'hr', 'admin', 'manager'],
    default: 'employee'
  },
  level: {
    type: String,
    enum: ['N0', 'N1', 'N2', 'N3', 'PnL'],
    default: 'N0'
  },
  reportingManagerId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  teamId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Team'
  },
  designation: String,
  departmentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Department'
  },
  joiningDate: Date,
  status: {
    type: String,
    enum: [
      'active', 
      'inactive', 
      'DOCUMENT_PENDING', 
      'DOCUMENTS_UPLOADED', 
      'OFFER_LETTER_PENDING', 
      'OFFER_LETTER_SIGNED', 
      'JOINING_LETTER_PENDING', 
      'JOINING_LETTER_SIGNED'
    ],
    default: 'active'
  },
  phone: String,
  address: String,
  bankDetails: {
    accountNumber: String,
    bankName: String,
    ifscCode: String
  },
  salary: {
    ctc: { type: String, default: '0' },
    basic: { type: String, default: '0' },
    hra: { type: String, default: '0' },
    specialAllowance: { type: String, default: '0' },
    pfPercentage: { type: String, default: '12' },
    esiPercentage: { type: String, default: '0.75' },
    professionalTax: { type: String, default: '200' },
    incomeTaxPercentage: { type: String, default: '0' }
  },
  geofence: {
    latitude: Number,
    longitude: Number,
    radius: {
      type: Number,
      default: 500
    }
  },
  personalDetails: {
    fatherName: String,
    motherName: String,
    aadharNumber: String,
    panNumber: String,
    dob: Date,
    bloodGroup: String,
    maritalStatus: String
  },
  documents: {
    aadhar: { url: String, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number },
    pan: { url: String, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number },
    bankPassbook: { url: String, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number },
    addressProof: { url: String, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number },
    offerLetter: { url: String, signed: Boolean, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number },
    joiningLetter: { url: String, signed: Boolean, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number },
    joiningAgreement: { url: String, signed: Boolean, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number },
    degreeCertificate: { url: String, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number },
    photo: { url: String, uploadedAt: Date, publicId: String, resourceType: String, format: String, deliveryType: String, version: Number }
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function (next) {
  try {
    const { encryptField } = require('../utils/fieldCrypto');
    const encIfPlain = (v) => {
      if (v === undefined || v === null || v === '') return v;
      if (typeof v === 'string' && v.startsWith('enc:')) return v;
      return encryptField(v);
    };

    if (this.personalDetails) {
      if (this.personalDetails.panNumber) this.personalDetails.panNumber = encIfPlain(this.personalDetails.panNumber);
      if (this.personalDetails.aadharNumber) this.personalDetails.aadharNumber = encIfPlain(this.personalDetails.aadharNumber);
    }
    if (this.bankDetails) {
      if (this.bankDetails.accountNumber) this.bankDetails.accountNumber = encIfPlain(this.bankDetails.accountNumber);
      if (this.bankDetails.ifscCode) this.bankDetails.ifscCode = encIfPlain(this.bankDetails.ifscCode);
      if (this.bankDetails.bankName) this.bankDetails.bankName = encIfPlain(this.bankDetails.bankName);
    }
    if (this.salary) {
      const keys = ['ctc', 'basic', 'hra', 'specialAllowance', 'pfPercentage', 'esiPercentage', 'professionalTax', 'incomeTaxPercentage'];
      for (const k of keys) {
        const v = this.salary[k];
        if (v === undefined || v === null || v === '') continue;
        this.salary[k] = encIfPlain(v);
      }
    }
  } catch {}

  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (this.isNew && !this.employeeId) {
    const count = await this.constructor.countDocuments();
    const sequence = (count + 1).toString().padStart(3, '0');
    this.employeeId = `NINJA${sequence}`;
  }
  next();
});

// Refresh token (rotating) support
UserSchema.add({
  refreshTokenHash: { type: String },
  refreshTokenExpires: { type: Date }
});

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ departmentId: 1 });
UserSchema.index({ reportingManagerId: 1 });
UserSchema.index({ teamId: 1 });

module.exports = mongoose.model('User', UserSchema);
