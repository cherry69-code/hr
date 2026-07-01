const Attendance = require('../models/Attendance');
const { getBusinessParts, getBusinessDayBounds, isMondayWeeklyOff } = require('./businessTime');

const businessDateKey = (date) => {
  const p = getBusinessParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.dayOfMonth).padStart(2, '0')}`;
};

const normalizeAttendanceStatus = (status) => {
  const raw = String(status || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const map = {
    present: 'Present',
    late: 'Late',
    'weekly off work': 'Weekly Off Work',
    'half day': 'Half Day',
    absent: 'Absent',
    lop: 'LOP',
    'missed punch': 'Missed Punch',
    weekend: 'Weekend',
    leave: 'Leave',
    holiday: 'Holiday'
  };
  return map[lower] || raw;
};

const paidWeightForStatus = (status) => {
  const s = normalizeAttendanceStatus(status);
  if (['Present', 'Late', 'Weekly Off Work', 'Leave', 'Holiday'].includes(s)) return 1;
  if (s === 'Half Day') return 0.5;
  if (s === 'Weekend') return 1;
  return 0;
};

const unpaidWeightForStatus = (status) => {
  const s = normalizeAttendanceStatus(status);
  if (s === 'LOP' || s === 'Absent' || s === 'Missed Punch') return 1;
  if (s === 'Half Day') return 0.5;
  return 0;
};

/**
 * Count paid (present) and unpaid days for payroll in [rangeStart, rangeEnd] (inclusive calendar days).
 * Policy: Monday = paid weekly off when no attendance row exists.
 * Net salary = (CTC/12 / daysInMonth) * presentDays
 */
const countPresentPayrollDays = async (employeeObjectId, rangeStart, rangeEnd) => {
  const startBounds = getBusinessDayBounds(rangeStart);
  const endBounds = getBusinessDayBounds(rangeEnd);

  const records = await Attendance.find({
    employeeId: employeeObjectId,
    date: { $gte: startBounds.start, $lte: endBounds.end }
  })
    .select('date status')
    .lean();

  const statusByDay = new Map();
  for (const r of records) {
    statusByDay.set(businessDateKey(r.date), normalizeAttendanceStatus(r.status));
  }

  let presentDays = 0;
  let unpaidDays = 0;
  const cursor = new Date(startBounds.start);
  const endDate = new Date(endBounds.start);
  endDate.setHours(0, 0, 0, 0);
  const todayStart = getBusinessDayBounds(new Date()).start;
  const countThrough = endDate.getTime() < todayStart.getTime() ? endDate : new Date(todayStart);

  while (cursor.getTime() <= endDate.getTime()) {
    const key = businessDateKey(cursor);
    const status = statusByDay.get(key);
    const isFutureDay = cursor.getTime() > countThrough.getTime();

    if (status) {
      presentDays += paidWeightForStatus(status);
      unpaidDays += unpaidWeightForStatus(status);
    } else if (isMondayWeeklyOff(cursor)) {
      presentDays += 1;
    } else if (!isFutureDay) {
      unpaidDays += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    presentDays: Math.round((presentDays + Number.EPSILON) * 100) / 100,
    unpaidDays: Math.round((unpaidDays + Number.EPSILON) * 100) / 100,
    hasRecords: records.length > 0
  };
};

const calculateProratedInHandSalary = (annualCtc, daysInMonth, presentDays) => {
  const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const monthlyInHand = Number(annualCtc || 0) / 12;
  const perDay = daysInMonth > 0 ? monthlyInHand / daysInMonth : 0;
  const netSalary = round2(perDay * Number(presentDays || 0));
  return { monthlyInHand: round2(monthlyInHand), perDay: round2(perDay), netSalary };
};

module.exports = {
  businessDateKey,
  normalizeAttendanceStatus,
  paidWeightForStatus,
  unpaidWeightForStatus,
  countPresentPayrollDays,
  calculateProratedInHandSalary
};
