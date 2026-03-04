const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  leaveType: {
    type: String,
    enum: ['Sick Leave', 'Casual Leave', 'Paid Leave', 'Unpaid Leave'],
    required: true
  },
  fromDate: {
    type: Date,
    required: true
  },
  toDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for performance
LeaveSchema.index({ employeeId: 1, status: 1 });
LeaveSchema.index({ status: 1 });

module.exports = mongoose.model('Leave', LeaveSchema);
