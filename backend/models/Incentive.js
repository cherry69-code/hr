const mongoose = require('mongoose');

const IncentiveSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  period: { // e.g., "March 2024" or "Q1 2024"
    type: String,
    required: true
  },
  targetAmount: {
    type: Number,
    required: true,
    default: 0
  },
  achievedAmount: {
    type: Number,
    required: true,
    default: 0
  },
  achievementPercentage: {
    type: Number,
    default: 0
  },
  incentiveAmount: {
    type: Number,
    default: 0
  },
  cashPayout: {
    type: Number,
    default: 0
  },
  esopAllocation: {
    type: Number,
    default: 0
  },
  overrideBonus: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Paid'],
    default: 'Pending'
  },
  calculatedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

IncentiveSchema.index({ employeeId: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Incentive', IncentiveSchema);
