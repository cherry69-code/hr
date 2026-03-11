const mongoose = require('mongoose');

const SalesRevenueSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    clientName: {
      type: String,
      required: true,
      trim: true
    },
    projectName: {
      type: String,
      required: true,
      trim: true
    },
    revenueAmount: {
      type: Number,
      required: true,
      min: 0
    },
    invoiceRaised: {
      type: Boolean,
      default: false
    },
    paymentCollected: {
      type: Boolean,
      default: false
    },
    bookingDate: {
      type: Date,
      required: true,
      index: true
    },
    invoiceUrl: {
      type: String,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

SalesRevenueSchema.index({ employeeId: 1, bookingDate: -1 });
SalesRevenueSchema.index({ invoiceRaised: 1, paymentCollected: 1, bookingDate: -1 });

module.exports = mongoose.model('SalesRevenue', SalesRevenueSchema);
