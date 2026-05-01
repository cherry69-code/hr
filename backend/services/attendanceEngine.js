const Attendance = require('../models/Attendance');
const Shift = require('../models/Shift');
const Leave = require('../models/Leave');

const parseHm = (hm) => {
  const m = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
};

const buildTimeOnDate = (date, hm) => {
  const p = parseHm(hm);
  if (!p) return null;
  const d = new Date(date);
  d.setHours(p.hh, p.mm, 0, 0);
  return d;
};

const minutesDiff = (a, b) => Math.floor((a.getTime() - b.getTime()) / (1000 * 60));

const getShiftForEmployee = async (employee) => {
  const fallback = {
    shiftStart: String(process.env.SHIFT_START || '10:00'),
    shiftEnd: String(process.env.SHIFT_END || '18:30'),
    graceMinutes: Number(process.env.SHIFT_GRACE_MINUTES || 15)
  };

  if (!employee?.shiftId) return fallback;
  const shift = await Shift.findById(employee.shiftId).lean();
  if (!shift) return fallback;
  return {
    shiftStart: shift.shiftStart || fallback.shiftStart,
    shiftEnd: shift.shiftEnd || fallback.shiftEnd,
    graceMinutes: Number.isFinite(Number(shift.graceMinutes)) ? Number(shift.graceMinutes) : fallback.graceMinutes
  };
};

exports.upsertAttendanceFromPunches = async ({ employee, deviceId, day, punches, source }) => {
  if (!employee?._id) throw new Error('Employee missing');
  if (!Array.isArray(punches) || !punches.length) return null;

  const startOfDay = new Date(day);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(day);
  endOfDay.setHours(23, 59, 59, 999);

  const isWeeklyOff = startOfDay.getDay() === 1;
  const approvedLeave = await Leave.findOne({
    employeeId: employee._id,
    status: 'approved',
    fromDate: { $lte: endOfDay },
    toDate: { $gte: startOfDay }
  })
    .select('_id')
    .lean();

  const sorted = punches
    .map((p) => new Date(p))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!sorted.length) return null;

  const checkInTime = sorted[0];
  const checkOutTime = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const missedPunch = sorted.length === 1;

  const shift = await getShiftForEmployee(employee);
  const shiftStart = buildTimeOnDate(startOfDay, shift.shiftStart || '10:00');
  const shiftEnd = buildTimeOnDate(startOfDay, shift.shiftEnd || '18:30');

  const workingMinutes = checkOutTime ? Math.max(0, minutesDiff(checkOutTime, checkInTime)) : 0;
  const lateMinutesRaw = shiftStart ? Math.max(0, minutesDiff(checkInTime, shiftStart)) : 0;
  const earlyExitMinutes = shiftEnd && checkOutTime ? Math.max(0, minutesDiff(shiftEnd, checkOutTime)) : 0;

  const lateFlag = lateMinutesRaw > 0;

  let status = 'Present';
  if (approvedLeave) {
    status = 'Present';
  } else if (isWeeklyOff) {
    status = 'Weekly Off Work';
  } else if (missedPunch) {
    status = 'Missed Punch';
  } else {
    status = !lateFlag && checkOutTime && shiftEnd && checkOutTime.getTime() >= shiftEnd.getTime() ? 'Present' : 'Half Day';
  }

  const existing = await Attendance.findOne({
    employeeId: employee._id,
    date: { $gte: startOfDay, $lte: endOfDay }
  });

  const locked = existing && (existing.source === 'ADMIN_OVERRIDE' || existing.status === 'LOP');
  if (locked) return existing;

  const payload = {
    employeeId: employee._id,
    date: startOfDay,
    checkInTime,
    checkOutTime: checkOutTime || undefined,
    workingMinutes,
    lateMinutes: approvedLeave || isWeeklyOff ? 0 : lateMinutesRaw,
    lateFlag: approvedLeave || isWeeklyOff ? false : lateFlag,
    earlyExitMinutes,
    missedPunch: approvedLeave ? false : missedPunch,
    source: source || 'BIOMETRIC',
    deviceId: deviceId || undefined,
    status,
    locationName: 'Office (Biometric)',
    locationValidated: true,
    insideRadius: true
  };

  if (!existing) {
    return Attendance.create(payload);
  }

  Object.assign(existing, payload);
  await existing.save();
  return existing;
};
