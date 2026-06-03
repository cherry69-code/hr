require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { getBusinessDayBounds } = require('../utils/businessTime');

const code = process.argv[2] || 'NINJA0017';

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    const u = await User.findOne({ employeeId: code }).lean();
    if (!u) {
      console.log('USER_NOT_FOUND');
      process.exit(0);
    }
    console.log('user', { _id: String(u._id), employeeId: u.employeeId, status: u.status, role: u.role });
    const now = new Date();
    const { start, end } = getBusinessDayBounds(now);
    const today = await Attendance.findOne({ employeeId: u._id, date: { $gte: start, $lte: end } }).lean();
    console.log(
      'todayAttendance',
      today ? { id: String(today._id), checkIn: today.checkInTime, status: today.status } : null
    );
    const recent = await Attendance.find({ employeeId: u._id }).sort('-date').limit(5).lean();
    console.log(
      'recent',
      recent.map((r) => ({ date: r.date, status: r.status, checkIn: r.checkInTime }))
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
