const mongoose = require('mongoose');

const AttendanceCorrectionSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  attendanceId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Attendance'
  },
  date: {
    type: Date,
    required: true
  },
  previousStatus: {
    type: String,
    enum: ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Weekend', 'Late'],
    default: 'Absent'
  },
  newStatus: {
    type: String,
    enum: ['Present', 'Absent', 'Half Day', 'LOP'],
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  requestedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  adminComment: {
    type: String
  }
}, { timestamps: true });

AttendanceCorrectionSchema.index({ employeeId: 1, date: 1 });
AttendanceCorrectionSchema.index({ status: 1 });

module.exports = mongoose.model('AttendanceCorrection', AttendanceCorrectionSchema);
