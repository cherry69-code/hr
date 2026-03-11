const mongoose = require('mongoose');

const IncentiveCalculationSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      index: true
    },
    year: {
      type: Number,
      required: true,
      index: true
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    eligibleRevenue: {
      type: Number,
      default: 0
    },
    targetRevenue: {
      type: Number,
      default: 0
    },
    baseIncentive: {
      type: Number,
      default: 0
    },
    aboveTargetIncentive: {
      type: Number,
      default: 0
    },
    teamOverrideBonus: {
      type: Number,
      default: 0
    },
    totalIncentive: {
      type: Number,
      default: 0
    },
    cashComponent: {
      type: Number,
      default: 0
    },
    esopComponent: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['Pending Collection', 'Pending', 'Approved', 'Rejected', 'Paid'],
      default: 'Pending'
    },
    rejectedAt: {
      type: Date
    },
    rejectedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    calculatedAt: {
      type: Date
    },
    calculatedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    approvedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    paidAt: {
      type: Date
    },
    paidBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

IncentiveCalculationSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });
IncentiveCalculationSchema.index({ status: 1, year: -1, month: -1 });

module.exports = mongoose.model('IncentiveCalculation', IncentiveCalculationSchema);
