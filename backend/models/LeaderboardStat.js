const mongoose = require('mongoose');

const LeaderboardStatSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      index: true
    },
    year: {
      type: Number,
      required: true,
      index: true
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    targetRevenue: {
      type: Number,
      default: 0
    },
    achievementPercent: {
      type: Number,
      default: 0
    },
    rank: {
      type: Number,
      default: 0
    },
    badge: {
      type: String,
      default: ''
    },
    lastUpdated: {
      type: Date
    }
  },
  { timestamps: true }
);

LeaderboardStatSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });
LeaderboardStatSchema.index({ year: -1, month: -1, rank: 1 });

module.exports = mongoose.model('LeaderboardStat', LeaderboardStatSchema);
