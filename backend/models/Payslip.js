const mongoose = require('mongoose');

const PayslipSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Generated'],
      default: 'Pending'
    },
    ctcAnnual: {
      type: Number,
      default: 0
    },
    ctcMonthly: {
      type: Number,
      default: 0
    },
    earnings: {
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      specialAllowance: { type: Number, default: 0 },
      grossSalary: { type: Number, default: 0 }
    },
    salaryBreakdown: {
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      gross: { type: Number, default: 0 }
    },
    employerContributions: {
      employerPF: { type: Number, default: 0 },
      gratuity: { type: Number, default: 0 }
    },
    incentiveBreakdown: {
      target: { type: Number, default: 0 },
      achievedNR: { type: Number, default: 0 },
      achievementMultiple: { type: Number, default: 0 },
      quarterlyIncentive: { type: Number, default: 0 },
      monthlyIncentiveAccrual: { type: Number, default: 0 },
      esopValue: { type: Number, default: 0 },
      cashValue: { type: Number, default: 0 },
      overrideBonus: { type: Number, default: 0 }
    },
    deductions: {
      professionalTax: { type: Number, default: 0 },
      employeePF: { type: Number, default: 0 },
      monthlyTDS: { type: Number, default: 0 },
      totalDeductions: { type: Number, default: 0 }
    },
    attendance: {
      totalWorkingDays: { type: Number, default: 0 },
      presentDays: { type: Number, default: 0 },
      unpaidLeaveDays: { type: Number, default: 0 }
    },
    netSalary: {
      type: Number,
      default: 0
    },
    pdfUrl: {
      type: String
    },
    generatedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

PayslipSchema.index({ employeeId: 1, year: -1, month: -1 }, { unique: true });

module.exports = mongoose.model('Payslip', PayslipSchema);
