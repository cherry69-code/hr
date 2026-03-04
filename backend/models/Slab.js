const mongoose = require('mongoose');

const SlabSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    enum: ['NE', 'N0', 'N1', 'N2', 'N3', 'Manager']
  },
  eligibilityTarget: {
    type: Number,
    required: true
  },
  basePercentage: {
    type: Number,
    required: true
  },
  abovePercentage: {
    type: Number,
    required: true
  },
  esopPercentage: {
    type: Number,
    default: 20
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// One active slab per role ideally, but we'll enforce that in controller or just take the latest
module.exports = mongoose.model('Slab', SlabSchema);
