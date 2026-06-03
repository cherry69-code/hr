/**
 * Simulates check-in API for one employee (default NINJA0017).
 * Usage: node scripts/test-ninja-checkin.js [employeeCode]
 */
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { resolveEmployeeByParam } = require('../controllers/attendanceController');

// resolveEmployeeByParam is not exported - inline copy
const resolveEmployee = async (param) => {
  const raw = String(param || '').trim();
  if (!raw) return null;
  if (/^[a-fA-F0-9]{24}$/.test(raw)) {
    const byId = await User.findById(raw).lean();
    if (byId) return byId;
  }
  return User.findOne({ employeeId: raw }).lean();
};

const code = process.argv[2] || 'NINJA0017';
const tinyJpeg =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGngP/Z';

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const employee = await resolveEmployee(code);
  if (!employee) {
    console.log('FAIL: user not found for', code);
    process.exit(1);
  }
  console.log('OK user', { _id: String(employee._id), employeeId: employee.employeeId, email: employee.email });

  const token = jwt.sign({ uid: String(employee._id), role: 'employee' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const base = process.env.API_BASE || 'http://localhost:5000/api';
  const res = await fetch(`${base}/attendance/checkin/${employee._id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      latitude: 12.97998,
      longitude: 77.53689,
      gpsAccuracyMeters: 15,
      photoBase64: tinyJpeg,
      faceVerified: true
    })
  });
  const body = await res.json().catch(() => ({}));
  console.log('checkin_status', res.status);
  console.log('checkin_body', body);
  process.exit(res.ok ? 0 : 1);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
