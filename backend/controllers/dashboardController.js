const User = require('../models/User');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const asyncHandler = require('../middlewares/asyncHandler');

exports.getStats = asyncHandler(async (req, res, next) => {
  const employeeId = req.query.employeeId;

  if (employeeId) {
    const pendingLeaves = await Leave.countDocuments({ employeeId, status: 'pending' });
    const approvedLeaves = await Leave.countDocuments({ employeeId, status: 'approved' });
    const totalAttendance = await Attendance.countDocuments({ employeeId });

    return res.status(200).json({
      success: true,
      data: {
        pendingLeaves,
        approvedLeaves,
        totalAttendance
      }
    });
  }

  const totalEmployees = await User.countDocuments({ role: 'employee' });
  const pendingLeaves = await Leave.countDocuments({ status: 'pending' });
  const pendingDocuments = await User.countDocuments({ status: 'DOCUMENT_PENDING' });
  const offerLettersPending = await User.countDocuments({ status: 'OFFER_LETTER_PENDING' });
  const joiningPending = await User.countDocuments({ status: 'JOINING_LETTER_PENDING' });

  // Present/Absent Today using Attendance
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const presentToday = await Attendance.countDocuments({
    date: { $gte: startOfDay, $lte: endOfDay }
  });
  const absentToday = Math.max(0, totalEmployees - presentToday);

  // Total Payroll (monthly) in Lakhs, computed from employees' annual CTC
  const employees = await User.find({ role: 'employee' }).select('salary.ctc').lean();
  let monthlyTotal = 0;
  for (const e of employees) {
    const annual = (e.salary && typeof e.salary.ctc === 'number') ? e.salary.ctc : 0;
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
