const Attendance = require('../models/Attendance');
const Shift = require('../models/Shift');
const Leave = require('../models/Leave');
const { getBusinessDayBounds, getBusinessMinutes, getBusinessParts, parseHmToMinutes } = require('../utils/businessTime');

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

  const { start: startOfDay, end: endOfDay } = getBusinessDayBounds(day);

  const isWeeklyOff = getBusinessParts(day).dayOfWeek === 1;
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
  const shiftStartMinutes = parseHmToMinutes(shift.shiftStart || '10:00', 10 * 60);
  const shiftEndMinutes = parseHmToMinutes(shift.shiftEnd || '18:30', 18 * 60 + 30);

  const workingMinutes = checkOutTime ? Math.max(0, minutesDiff(checkOutTime, checkInTime)) : 0;
  const checkInMinutes = getBusinessMinutes(checkInTime);
  const checkOutMinutes = checkOutTime ? getBusinessMinutes(checkOutTime) : null;
  const lateMinutesRaw = Math.max(0, checkInMinutes - shiftStartMinutes);
  const earlyExitMinutes = checkOutMinutes !== null ? Math.max(0, shiftEndMinutes - checkOutMinutes) : 0;

  const lateFlag = lateMinutesRaw > 0;

  let status = 'Present';
  if (approvedLeave) {
    status = 'Present';
  } else if (isWeeklyOff) {
    status = 'Weekly Off Work';
  } else if (missedPunch) {
    status = 'Missed Punch';
  } else {
    status = !lateFlag && checkOutMinutes !== null && checkOutMinutes >= shiftEndMinutes ? 'Present' : 'Half Day';
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
