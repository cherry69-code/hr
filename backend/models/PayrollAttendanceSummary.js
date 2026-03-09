const mongoose = require('mongoose');

const PayrollAttendanceSummarySchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: Number,
    required: true // 1-12
  },
  year: {
    type: Number,
    required: true
  },
  totalPresentDays: {
    type: Number,
    default: 0
  },
  totalHalfDays: {
    type: Number,
    default: 0
  },
  totalLopDays: {
    type: Number,
    default: 0
  },
  totalAbsentDays: {
    type: Number,
    default: 0
  },
  calculatedWorkDays: {
    type: Number,
    default: 0
  },
  salaryDeduction: {
    type: Number,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

PayrollAttendanceSummarySchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('PayrollAttendanceSummary', PayrollAttendanceSummarySchema);
