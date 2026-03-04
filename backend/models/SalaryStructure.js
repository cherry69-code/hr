const mongoose = require('mongoose');

const SalaryStructureSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  basic: {
    type: Number,
    required: true
  },
  hra: {
    type: Number,
    required: true
  },
  specialAllowance: {
    type: Number,
    required: true
  },
  pf: {
    type: Number,
    required: true
  },
  esi: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SalaryStructure', SalaryStructureSchema);
