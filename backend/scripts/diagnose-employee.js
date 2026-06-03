require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const FieldAttendanceLog = require('../models/FieldAttendanceLog');
const { getBusinessDayBounds, getBusinessParts } = require('../utils/businessTime');

const code = process.argv[2] || 'NINJA0017';

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const users = await User.find({ $or: [{ employeeId: code }, { employeeId: new RegExp(`^${code}$`, 'i') }] }).lean();
  console.log('users_count', users.length);
  for (const u of users) {
    console.log('user', {
      _id: String(u._id),
      employeeId: u.employeeId,
      email: u.email,
      status: u.status,
      role: u.role,
      fullName: u.fullName
    });
  }

  const u = users[0];
  if (!u) {
    console.log('NO_USER');
    process.exit(0);
  }

  const now = new Date();
  const parts = getBusinessParts(now);
  const { start, end } = getBusinessDayBounds(now);
  console.log('business_now', { parts, start, end });

  const today = await Attendance.find({ employeeId: u._id, date: { $gte: start, $lte: end } }).lean();
  console.log('today_attendance', today);

  const allRecent = await Attendance.find({ employeeId: u._id }).sort('-date').limit(10).lean();
  console.log(
    'recent_attendance',
    allRecent.map((r) => ({
      id: String(r._id),
      date: r.date,
      dateKey: `${getBusinessParts(r.date).year}-${String(getBusinessParts(r.date).month + 1).padStart(2, '0')}-${String(getBusinessParts(r.date).dayOfMonth).padStart(2, '0')}`,
      checkInTime: r.checkInTime,
      status: r.status,
      source: r.source
    }))
  );

  const fieldLogs = await FieldAttendanceLog.find({ employeeId: u._id }).sort('-punchTime').limit(5).lean();
  console.log('field_logs', fieldLogs.length);

  // Ghost records: same employeeId string stored as employeeId field wrongly?
  const wrongType = await Attendance.find({ employeeId: code }).limit(5).lean();
  console.log('attendance_with_string_employeeId', wrongType.length);

  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
