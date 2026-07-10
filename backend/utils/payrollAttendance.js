const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const {
  getBusinessParts,
  getBusinessDayBounds,
  isMondayWeeklyOff,
  eachBusinessCalendarDay,
  isBusinessMonthComplete
} = require('./businessTime');

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

const normalizeLeaveType = (leaveType) => {
  const raw = String(leaveType || '').trim().toLowerCase();
  if (raw === 'unpaid leave') return 'Unpaid Leave';
  if (raw === 'paid leave') return 'Paid Leave';
  if (raw === 'sick leave') return 'Sick Leave';
  if (raw === 'casual leave') return 'Casual Leave';
  return '';
};

const isPaidApprovedLeave = (leaveType) => {
  const normalized = normalizeLeaveType(leaveType);
  return Boolean(normalized) && normalized !== 'Unpaid Leave';
};

const getApprovedLeavesByDay = async (employeeObjectId, rangeStart, rangeEnd) => {
  const leaves = await Leave.find({
    employeeId: employeeObjectId,
    status: 'approved',
    fromDate: { $lte: rangeEnd },
    toDate: { $gte: rangeStart }
  })
    .select('fromDate toDate leaveType')
    .lean();

  const leaveByDay = new Map();
  for (const leave of leaves) {
    const fromBounds = getBusinessDayBounds(leave.fromDate);
    const toBounds = getBusinessDayBounds(leave.toDate);
    const overlapStart = fromBounds.start.getTime() > rangeStart.getTime() ? fromBounds.start : rangeStart;
    const overlapEnd = toBounds.end.getTime() < rangeEnd.getTime() ? toBounds.end : rangeEnd;
    if (overlapStart.getTime() > overlapEnd.getTime()) continue;

    eachBusinessCalendarDay(overlapStart, overlapEnd, ({ dateKey }) => {
      const nextType = normalizeLeaveType(leave.leaveType);
      if (!nextType) return;
      const previousType = leaveByDay.get(dateKey);
      if (!previousType || previousType === 'Unpaid Leave') {
        leaveByDay.set(dateKey, nextType);
      }
    });
  }

  return leaveByDay;
};

/**
 * Count paid (present) and unpaid days for payroll in [rangeStart, rangeEnd] (inclusive IST calendar days).
 * Policy: Monday = paid weekly off when no attendance row exists.
 * Net salary = (CTC/12 / daysInMonth) * presentDays
 */
const countPresentPayrollDays = async (employeeObjectId, rangeStart, rangeEnd, options = {}) => {
  const startBounds = getBusinessDayBounds(rangeStart);
  const endBounds = getBusinessDayBounds(rangeEnd);
  const payrollYear = Number(options.payrollYear || 0);
  const payrollMonth = Number(options.payrollMonth || 0);
  const monthComplete =
    options.forceFullMonth === true ||
    (payrollYear > 0 && payrollMonth > 0 && isBusinessMonthComplete(payrollYear, payrollMonth));

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

  const approvedLeaveByDay = await getApprovedLeavesByDay(employeeObjectId, startBounds.start, endBounds.end);

  let presentDays = 0;
  let unpaidDays = 0;
  let calendarDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  const todayKey = businessDateKey(new Date());

  eachBusinessCalendarDay(rangeStart, rangeEnd, ({ dateKey, dateRef }) => {
    calendarDays += 1;
    const leaveType = approvedLeaveByDay.get(dateKey);
    const status = statusByDay.get(dateKey);
    const isFutureDay = !monthComplete && dateKey > todayKey;

    if (status) {
      let paid = paidWeightForStatus(status);
      let unpaid = unpaidWeightForStatus(status);

      if (leaveType) {
        if (isPaidApprovedLeave(leaveType) && paid === 0) {
          paid = 1;
          unpaid = 0;
          paidLeaveDays += 1;
        } else if (!isPaidApprovedLeave(leaveType) && paid === 0 && unpaid === 0) {
          unpaid = 1;
          unpaidLeaveDays += 1;
        }
      }

      presentDays += paid;
      unpaidDays += unpaid;
      if (paid === 0 && unpaid === 0 && !isMondayWeeklyOff(dateRef)) {
        unpaidDays += 1;
      }
    } else if (leaveType) {
      if (isPaidApprovedLeave(leaveType)) {
        presentDays += 1;
        paidLeaveDays += 1;
      } else {
        unpaidDays += 1;
        unpaidLeaveDays += 1;
      }
    } else if (isMondayWeeklyOff(dateRef)) {
      presentDays += 1;
    } else if (!isFutureDay) {
      unpaidDays += 1;
    }
  });

  return {
    presentDays: Math.round((presentDays + Number.EPSILON) * 100) / 100,
    unpaidDays: Math.round((unpaidDays + Number.EPSILON) * 100) / 100,
    paidLeaveDays: Math.round((paidLeaveDays + Number.EPSILON) * 100) / 100,
    unpaidLeaveDays: Math.round((unpaidLeaveDays + Number.EPSILON) * 100) / 100,
    calendarDays,
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
  normalizeLeaveType,
  countPresentPayrollDays,
  calculateProratedInHandSalary
};
