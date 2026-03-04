const mongoose = require('mongoose');

const ESOPSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  totalGranted: {
    type: Number,
    required: true
  },
  vestingStartDate: {
    type: Date,
    required: true
  },
  vestingPeriodMonths: {
    type: Number,
    required: true,
    default: 48 // 4 years
  },
  cliffMonths: {
    type: Number,
    default: 12 // 1 year cliff
  },
  vestedShares: {
    type: Number,
    default: 0
  },
  unvestedShares: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Exercised', 'Cancelled'],
    default: 'Active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ESOP', ESOPSchema);
