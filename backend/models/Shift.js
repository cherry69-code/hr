const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  shiftStart: {
    type: String,
    required: true,
    trim: true
  },
  shiftEnd: {
    type: String,
    required: true,
    trim: true
  },
  graceMinutes: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Shift', ShiftSchema);
