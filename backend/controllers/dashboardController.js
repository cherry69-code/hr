const User = require('../models/User');
const Leave = require('../models/Leave');
const asyncHandler = require('../middlewares/asyncHandler');

exports.getStats = asyncHandler(async (req, res, next) => {
  const employeeId = req.query.employeeId;

  if (employeeId) {
    const pendingLeaves = await Leave.countDocuments({ employeeId, status: 'pending' });
    const approvedLeaves = await Leave.countDocuments({ employeeId, status: 'approved' });
    const totalAttendance = 20; // Mock

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

  // Get Payroll Status (Assuming Payroll model exists, otherwise count processed for this month)
  // const payrollProcessed = await Payroll.countDocuments({ month: new Date().getMonth(), year: new Date().getFullYear(), status: 'paid' });

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
      presentToday: Math.floor(totalEmployees * 0.9), 
      absentToday: Math.floor(totalEmployees * 0.1)
    }
  });
});
