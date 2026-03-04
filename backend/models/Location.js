const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a location name'],
      trim: true
    },
    latitude: {
      type: Number,
      required: [true, 'Please add latitude']
    },
    longitude: {
      type: Number,
      required: [true, 'Please add longitude']
    },
    radius: {
      type: Number,
      default: 20
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

LocationSchema.index({ active: 1 });

module.exports = mongoose.model('Location', LocationSchema);
