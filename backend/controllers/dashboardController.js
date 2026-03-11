const User = require('../models/User');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
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

  // Parallelize independent queries
  const [
    totalEmployees,
    pendingLeaves,
    pendingDocuments,
    offerLettersPending,
    joiningPending,
    presentToday,
    employees
  ] = await Promise.all([
    User.countDocuments({ role: 'employee', status: 'active' }),
    Leave.countDocuments({ status: 'pending' }),
    User.countDocuments({ status: 'DOCUMENT_PENDING' }),
    User.countDocuments({ status: 'OFFER_LETTER_PENDING' }),
    User.countDocuments({ status: 'JOINING_LETTER_PENDING' }),
    Attendance.countDocuments({
      date: { 
        $gte: new Date(new Date().setHours(0, 0, 0, 0)), 
        $lte: new Date(new Date().setHours(23, 59, 59, 999)) 
      }
    }),
    User.find({ role: 'employee', status: 'active' }).select('salary.ctc').lean()
  ]);

  const absentToday = Math.max(0, totalEmployees - presentToday);

  // Total Payroll (monthly) in Lakhs, computed from employees' annual CTC
  let monthlyTotal = 0;
  const { decryptField } = require('../utils/fieldCrypto');
  for (const e of employees) {
    const annual = Number(decryptField(e?.salary?.ctc ?? 0) || 0);
    monthlyTotal += annual / 12;
  }
  const totalPayrollL = Math.round((monthlyTotal / 100000) * 100) / 100; // round to 2 decimals

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
