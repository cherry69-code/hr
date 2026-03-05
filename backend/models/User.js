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
    ctc: { type: Number, default: 0 },
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    pfPercentage: { type: Number, default: 12 },
    esiPercentage: { type: Number, default: 0.75 },
    professionalTax: { type: Number, default: 200 },
    incomeTaxPercentage: { type: Number, default: 0 }
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
    aadhar: { url: String, uploadedAt: Date },
    pan: { url: String, uploadedAt: Date },
    bankPassbook: { url: String, uploadedAt: Date },
    addressProof: { url: String, uploadedAt: Date },
    offerLetter: { url: String, signed: Boolean, uploadedAt: Date },
    joiningLetter: { url: String, signed: Boolean, uploadedAt: Date },
    joiningAgreement: { url: String, signed: Boolean, uploadedAt: Date },
    degreeCertificate: { url: String, uploadedAt: Date },
    photo: { url: String, uploadedAt: Date }
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
