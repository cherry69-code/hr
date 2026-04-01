const User = require('../models/User');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const Payslip = require('../models/Payslip');
const asyncHandler = require('../middlewares/asyncHandler');

exports.getStats = asyncHandler(async (req, res, next) => {
  const employeeId = req.query.employeeId;

  if (employeeId) {
    const [pendingLeaves, approvedLeaves, totalAttendance] = await Promise.all([
      Leave.countDocuments({ employeeId, status: 'pending' }),
      Leave.countDocuments({ employeeId, status: 'approved' }),
      Attendance.countDocuments({ employeeId })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        pendingLeaves,
        approvedLeaves,
        totalAttendance
      }
    });
  }

  const employeeScope = { role: { $ne: 'admin' }, status: { $ne: 'inactive' } };
  const employees = await User.find(employeeScope).select('salary.ctc joiningDate').lean();
  const employeeIds = employees.map((e) => e._id);

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);

  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [pendingLeaves, pendingDocuments, offerLettersPending, joiningPending, presentIds, payrollAgg] = await Promise.all([
    Leave.countDocuments({ status: 'pending' }),
    User.countDocuments({ ...employeeScope, status: 'DOCUMENT_PENDING' }),
    User.countDocuments({ ...employeeScope, status: 'OFFER_LETTER_PENDING' }),
    User.countDocuments({ ...employeeScope, status: 'JOINING_LETTER_PENDING' }),
    Attendance.distinct('employeeId', { employeeId: { $in: employeeIds }, date: { $gte: startToday, $lte: endToday } }),
    Payslip.aggregate([
      { $match: { employeeId: { $in: employeeIds }, month: currentMonth, year: currentYear, status: 'Generated' } },
      { $group: { _id: null, total: { $sum: '$netSalary' }, count: { $sum: 1 } } }
    ])
  ]);

  const totalEmployees = employees.length;
  const presentToday = Array.isArray(presentIds) ? presentIds.length : 0;
  const absentToday = Math.max(0, totalEmployees - presentToday);

  const payrollTotal = payrollAgg && payrollAgg[0] ? Number(payrollAgg[0].total || 0) : 0;

  let totalPayrollL = 0;
  if (payrollTotal > 0) {
    totalPayrollL = Math.round((payrollTotal / 100000) * 100) / 100;
  } else {
    let monthlyTotal = 0;
    const { decryptField } = require('../utils/fieldCrypto');
    const monthStart = new Date(currentYear, currentMonth - 1, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEndDay = new Date(currentYear, currentMonth, 0);
    monthEndDay.setHours(0, 0, 0, 0);
    const daysInMonth = monthEndDay.getDate();
    for (const e of employees) {
      let annual = 0;
      try {
        annual = Number(decryptField(e?.salary?.ctc ?? 0) || 0);
      } catch {
        annual = Number(e?.salary?.ctc ?? 0) || 0;
      }
      const monthly = annual / 12;
      let factor = 1;
      if (e?.joiningDate) {
        const jd = new Date(e.joiningDate);
        if (!Number.isNaN(jd.getTime())) {
          const joinStart = new Date(jd);
          joinStart.setHours(0, 0, 0, 0);
          if (joinStart.getTime() > monthEndDay.getTime()) {
            factor = 0;
          } else if (joinStart.getTime() > monthStart.getTime()) {
            const eligibleDays = daysInMonth - joinStart.getDate() + 1;
            factor = daysInMonth > 0 ? eligibleDays / daysInMonth : 1;
          }
        }
      }
      monthlyTotal += monthly * factor;
    }
    totalPayrollL = Math.round((monthlyTotal / 100000) * 100) / 100;
  }

  res.status(200).json({
    success: true,
    data: {
      totalEmployees,
      pendingLeaves,
      onboarding: {
          pendingDocs: pendingDocuments,
          offerPending: offerLettersPending,
          joiningPending: joiningPending
      },
      presentToday, 
      absentToday,
      totalPayroll: totalPayrollL
    }
  });
});
