const mongoose = require('mongoose');

const BiometricEmployeeMappingSchema = new mongoose.Schema(
  {
    etimeUserId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    active: {
      type: Boolean,
      default: true
    },
    notes: {
      type: String,
      trim: true
    },
    validatedAt: {
      type: Date
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('BiometricEmployeeMapping', BiometricEmployeeMappingSchema);
