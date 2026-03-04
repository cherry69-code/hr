const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkInTime: Date,
  checkOutTime: Date,
  latitude: Number,
  longitude: Number,
  locationId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Location'
  },
  locationName: String,
  locationValidated: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late'],
    default: 'Absent'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for performance
AttendanceSchema.index({ employeeId: 1, date: -1 });
AttendanceSchema.index({ date: -1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
