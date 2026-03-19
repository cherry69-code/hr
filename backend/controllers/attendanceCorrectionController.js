const AttendanceCorrection = require('../models/AttendanceCorrection');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const PayrollAttendanceSummary = require('../models/PayrollAttendanceSummary');
const asyncHandler = require('../middlewares/asyncHandler');
const { sendCategorizedEmail, EmailType } = require('../utils/emailRouter');

// Helper to recalculate payroll summary
const recalculatePayrollSummary = async (employeeId, date) => {
  const targetDate = new Date(date);
  const month = targetDate.getMonth() + 1; // 1-12
  const year = targetDate.getFullYear();
  
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  startOfMonth.setHours(0, 0, 0, 0);
  const endDay = new Date(year, month, 0);
  endDay.setHours(0, 0, 0, 0);

  const employee = await User.findById(employeeId).select('salary joiningDate').lean();

  let effectiveStart = new Date(startOfMonth);
  const jd = employee?.joiningDate ? new Date(employee.joiningDate) : null;
  if (jd && !Number.isNaN(jd.getTime())) {
    const joinStart = new Date(jd);
    joinStart.setHours(0, 0, 0, 0);
    if (joinStart.getTime() > endDay.getTime()) {
      await PayrollAttendanceSummary.findOneAndUpdate(
        { employeeId, month, year },
        {
          totalPresentDays: 0,
          totalHalfDays: 0,
          totalLopDays: 0,
          totalAbsentDays: 0,
          calculatedWorkDays: 0,
          salaryDeduction: 0,
          updatedAt: Date.now()
        },
        { upsert: true, new: true }
      );
      return;
    }
    if (joinStart.getTime() > effectiveStart.getTime()) {
      effectiveStart = joinStart;
    }
  }

  // 1. Fetch attendance records for the month
  const records = await Attendance.find({
    employeeId,
    date: { $gte: effectiveStart, $lte: endOfMonth }
  });

  // 2. Count statuses
  let present = 0;
  let halfDay = 0;
  let lop = 0;
  let absent = 0;

  records.forEach(r => {
    const s = r.status ? r.status.toLowerCase() : 'absent';
    if (s === 'present' || s === 'weekly off work') present++;
    else if (s === 'half day') halfDay++;
    else if (s === 'lop') lop++;
    else if (s === 'absent') absent++;
  });

  // 3. Calculate Logic
  // Present = 1 day
  // Half Day = 0.5 day
  // LOP = Deduction (Not counted in working days)
  // Absent = Deduction (Not counted in working days)
  
  const calculatedWorkDays = present + (halfDay * 0.5);
  
  // Salary Deduction Logic
  // Assuming 30 days or actual days in month?
  // Usually salary is fixed monthly. Deduction is per day LOP/Absent.
  let annualCTC = Number(employee?.salary?.ctc || 0);
  try {
    const { decryptField } = require('../utils/fieldCrypto');
    annualCTC = Number(decryptField(employee?.salary?.ctc ?? 0) || 0);
  } catch {}
  const monthlySalary = annualCTC / 12;
  
  // Total days in month for per-day calculation
  const daysInMonth = endDay.getDate();
  const eligibleDays = Math.floor((endDay.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const factor = daysInMonth > 0 ? eligibleDays / daysInMonth : 1;
  const baseMonthly = monthlySalary * factor;
  const salaryPerDay = eligibleDays > 0 ? (baseMonthly / eligibleDays) : 0;
  
  const deductionDays = lop + absent + (halfDay * 0.5);
  const salaryDeduction = Math.round(deductionDays * salaryPerDay);

  // 4. Update Summary
  await PayrollAttendanceSummary.findOneAndUpdate(
    { employeeId, month, year },
    {
      totalPresentDays: present,
      totalHalfDays: halfDay,
      totalLopDays: lop,
      totalAbsentDays: absent,
      calculatedWorkDays,
      salaryDeduction,
      updatedAt: Date.now()
    },
    { upsert: true, new: true }
  );
};

// @desc    Request Attendance Correction (or Direct Update for Admin)
// @route   POST /api/attendance/correction
// @access  Private (HR/Admin)
exports.requestCorrection = asyncHandler(async (req, res, next) => {
  const { employeeId, date, newStatus, reason } = req.body;
  const requestedBy = req.user._id;

  // Validate date
  const correctionDate = new Date(date);
  const startOfDay = new Date(correctionDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(correctionDate.setHours(23, 59, 59, 999));

  // Fetch existing attendance if any
  const existingAttendance = await Attendance.findOne({
    employeeId,
    date: { $gte: startOfDay, $lte: endOfDay }
  });

  const previousStatus = existingAttendance ? existingAttendance.status : 'Absent';

  const correctionPayload = {
    employeeId,
    attendanceId: existingAttendance ? existingAttendance._id : undefined,
    date: startOfDay,
    previousStatus,
    newStatus,
    reason,
    requestedBy
  };

  // If Admin, apply directly
  if (req.user.role === 'admin') {
    correctionPayload.status = 'Approved';
    correctionPayload.approvedBy = req.user._id;

    const correction = await AttendanceCorrection.create(correctionPayload);

    // Apply Update to Attendance Table
    if (existingAttendance) {
      existingAttendance.status = newStatus;
      await existingAttendance.save();
    } else {
      // Create new record if Absent previously (and no record existed)
      if (newStatus !== 'Absent') { 
        await Attendance.create({
            employeeId,
            date: startOfDay,
            checkInTime: startOfDay, // Placeholder
            checkOutTime: endOfDay, // Placeholder
            status: newStatus,
            locationName: 'Manual Adjustment',
            locationValidated: true
        });
      }
    }

    // Trigger Payroll Recalculation
    await recalculatePayrollSummary(employeeId, startOfDay);

    // Audit Log
    await AuditLog.create({
      documentId: correction._id,
      action: 'attendance_correction_approved',
      performedBy: String(req.user._id),
      meta: { employeeId, oldStatus: previousStatus, newStatus }
    });

    return res.status(200).json({ success: true, data: correction, message: 'Attendance updated successfully' });
  }

  // If HR, submit for approval
  const correction = await AttendanceCorrection.create(correctionPayload);
  
  // Audit Log
  await AuditLog.create({
      documentId: correction._id,
      action: 'attendance_correction_requested',
      performedBy: String(req.user._id),
      meta: { employeeId, oldStatus: previousStatus, newStatus }
  });

  res.status(200).json({ success: true, data: correction, message: 'Correction request submitted for approval' });
});

// @desc    Get Correction Requests
// @route   GET /api/attendance/correction
// @access  Private (Admin/HR)
exports.getCorrectionRequests = asyncHandler(async (req, res, next) => {
  const query = {};
  if (req.query.status) {
    query.status = req.query.status;
  }
  
  const corrections = await AttendanceCorrection.find(query)
    .populate('employeeId', 'fullName employeeId departmentId')
    .populate('requestedBy', 'fullName')
    .populate('approvedBy', 'fullName')
    .sort('-createdAt');

  res.status(200).json({ success: true, data: corrections });
});

// @desc    Approve/Reject Correction Request
// @route   PUT /api/attendance/correction/:id
// @access  Private (Admin)
exports.updateCorrectionStatus = asyncHandler(async (req, res, next) => {
  const { status, adminComment } = req.body; // status: 'Approved' or 'Rejected'
  
  const correction = await AttendanceCorrection.findById(req.params.id).populate('employeeId');
  if (!correction) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }

  if (correction.status !== 'Pending') {
    return res.status(400).json({ success: false, error: 'Request already processed' });
  }

  correction.status = status;
  correction.adminComment = adminComment;
  correction.approvedBy = req.user._id;
  await correction.save();

  if (status === 'Approved') {
    // Apply changes
    const startOfDay = new Date(correction.date);
    const endOfDay = new Date(new Date(correction.date).setHours(23, 59, 59, 999));

    const existingAttendance = await Attendance.findOne({
        employeeId: correction.employeeId,
        date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (existingAttendance) {
        existingAttendance.status = correction.newStatus;
        await existingAttendance.save();
    } else {
        if (correction.newStatus !== 'Absent') {
            await Attendance.create({
                employeeId: correction.employeeId,
                date: startOfDay,
                checkInTime: startOfDay,
                checkOutTime: endOfDay,
                status: correction.newStatus,
                locationName: 'Manual Adjustment (Approved)',
                locationValidated: true
            });
        }
    }

    // Trigger Payroll Recalculation
    await recalculatePayrollSummary(correction.employeeId, startOfDay);
  }

  // Audit Log
  await AuditLog.create({
      documentId: correction._id,
      action: `attendance_correction_${status.toLowerCase()}`,
      performedBy: String(req.user._id),
      meta: { employeeId: correction.employeeId._id, status }
  });

  // Notify Employee (Operational)
  try {
    const employee = correction.employeeId;
    await sendCategorizedEmail(employee, EmailType.OPERATIONAL, {
      subject: `Attendance Correction ${status}`,
      text: `Your attendance correction request for ${new Date(correction.date).toDateString()} has been ${status}. ${adminComment ? 'Comment: ' + adminComment : ''}`,
      html: `
        <p>Dear ${employee.fullName},</p>
        <p>Your attendance correction request for <b>${new Date(correction.date).toDateString()}</b> has been <b>${status.toUpperCase()}</b>.</p>
        ${adminComment ? `<p>Admin Comment: ${adminComment}</p>` : ''}
        <p>Please check your attendance dashboard for details.</p>
        <p>Regards,<br>HR Team</p>
      `
    });
  } catch (err) {
    console.error('Failed to send attendance correction email:', err);
  }

  res.status(200).json({ success: true, data: correction });
});
